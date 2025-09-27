import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

export class DeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ENV variables
    const region = process.env.AWS_REGION || config.global.region;
    const condeconnectionsArn = process.env.CODECONNECTION_ARN || config.deploy.codeconnectionsArn;
    const repository = process.env.REPOSITORY || config.deploy.repository;

    // Validate required config values
    if (!condeconnectionsArn) {
      throw new Error('CODECONNECTION_ARN is not set in environment variables or config.json');
    }
    if (!repository) {
      throw new Error('REPOSITORY is not set in environment variables or config.json');
    }
    if (!region) {
      throw new Error('AWS_REGION is not set in environment variables or config.json');
    }

    // IAM roles
    const codebuildRole = new iam.CfnRole(this, 'CodeBuildServiceRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'codebuild.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonS3FullAccess',
        'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser',
        'arn:aws:iam::aws:policy/AmazonECS_FullAccess',
        'arn:aws:iam::aws:policy/CloudWatchLogsFullAccess',
      ],
      roleName: 'CodeBuildServiceRole',
    });

    const codepipelineRole = new iam.CfnRole(this, 'CodePipelineServiceRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'codepipeline.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AWSCodePipeline_FullAccess',
        'arn:aws:iam::aws:policy/AWSCodeBuildDeveloperAccess',
        'arn:aws:iam::aws:policy/AmazonS3FullAccess',
        'arn:aws:iam::aws:policy/AmazonECS_FullAccess',
        'arn:aws:iam::aws:policy/AWSCodeStarFullAccess'
      ],
      roleName: 'CodePipelineServiceRole',
    });

    const codeconnectionsPolicy = new iam.CfnPolicy(this, 'CodeConnectionsPolicy', {
      policyName: 'CodeConnectionsPolicy',
      roles: [codepipelineRole.ref],
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'codestar-connections:UseConnection'
            ],
            Resource: `${condeconnectionsArn}`
          }
        ]
      }
    });

    // Imported values from other stacks
    const ecrUri = cdk.Fn.importValue('ECRRepoURI');
    const ecsClusterName = cdk.Fn.importValue('EcsClusterName');
    const ecsServiceName = cdk.Fn.importValue('EcsServiceName');

    // Artifact Bucket
    const artifactBucket = new s3.CfnBucket(this, 'ArtifactBucket', {
      bucketName: config.deploy.artifactBucketName,
      versioningConfiguration: {
        status: 'Enabled',
      },
    });  

    // CodeBuild
    const buildProject = new codebuild.CfnProject(this, 'DemoBuildProject', {
      name: config.deploy.codeBuildProjectName,
      source: {
        type: 'CODEPIPELINE',
        buildSpec: '.build/buildspec.yml',
        gitCloneDepth: 0,
      },
      environment: {
        type: 'ARM_CONTAINER',
        image: 'aws/codebuild/amazonlinux2-aarch64-standard:3.0',
        computeType: 'BUILD_GENERAL1_MEDIUM',
        privilegedMode: true,
        environmentVariables: [
          {
            name: 'ECR_REPO_URI',
            value: ecrUri,
          },
          {
            name: 'IMAGE_TAG',
            value: 'l1',
          },
          {
            name: 'AWS_DEFAULT_REGION',
            value: region,
          },
          {
            name: 'AWS_ACCOUNT_ID',
            value: cdk.Stack.of(this).account,
          },
          {
            name: 'CONTAINER_NAME',
            value: 'nginx-container',
          }
        ],
      },
      logsConfig: {
        cloudWatchLogs: {
          status: 'ENABLED',
          groupName: '/aws/codebuild/DemoBuildProject-L1',
        },
      },
      artifacts: {
        type: 'CODEPIPELINE',
      },
      serviceRole: codebuildRole.attrArn,
    });

    // CodePipeline
    const pipeline = new codepipeline.CfnPipeline(this, 'DemoPipeline', {
      name: config.deploy.pipelineName,
      roleArn: codepipelineRole.attrArn,
      stages: [
        {
          name: 'Source',
          actions: [
            {
              name: 'SourceAction',
              actionTypeId: {
                category: 'Source',
                owner: 'AWS',
                provider: 'CodeStarSourceConnection',
                version: '1',
              },
              outputArtifacts: [{ name: 'SourceOutput' }],
              configuration: {
                ConnectionArn: condeconnectionsArn,
                FullRepositoryId: repository,
                BranchName: config.deploy.branch,
              },
              runOrder: 1,
            },
          ],
        },
        {
          name: 'Build',
          actions: [
            {
              name: 'BuildAction',
              actionTypeId: {
                category: 'Build',
                owner: 'AWS',
                provider: 'CodeBuild',
                version: '1',
              },
              inputArtifacts: [{ name: 'SourceOutput' }],
              outputArtifacts: [{ name: 'BuildOutput' }],
              configuration: {
                ProjectName: buildProject.name!,
              },
              runOrder: 1,
            },
          ],
        },
        {
          name: 'Deploy',
          actions: [
            {
              name: 'DeployAction',
              actionTypeId: {
                category: 'Deploy',
                owner: 'AWS',
                provider: 'ECS',
                version: '1',
              },
              inputArtifacts: [{ name: 'BuildOutput' }],
              configuration: {
                ClusterName: ecsClusterName,
                ServiceName: ecsServiceName,
                FileName: "imagedefinitions.json"
              },
              runOrder: 1,
            },
          ],
        },
      ],
      artifactStore: {
        type: 'S3',
        location: artifactBucket.bucketName!,
      },
    });
  }
}