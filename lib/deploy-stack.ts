import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';


export class DeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
            Resource: 'arn:aws:codeconnections:eu-central-1:664492798177:connection/75bbfa41-fa06-4410-843d-a165aeb828c4'
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
      bucketName: 'codepipeline-demo-l1-artifact-store',
      versioningConfiguration: {
        status: 'Enabled',
      },
    });  

    // CodeBuild
    const buildProject = new codebuild.CfnProject(this, 'DemoBuildProject', {
      name: 'DemoBuildProject-L1',
      source: {
        type: 'CODEPIPELINE',
        buildSpec: '.build/buildspec.yml',
        gitCloneDepth: 0,
      },
      environment: {
        type: 'LINUX_CONTAINER',
        image: 'aws/codebuild/standard:5.0',
        computeType: 'BUILD_GENERAL1_SMALL',
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
            value: 'eu-central-1',
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
      name: 'DemoPipeline-L1',
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
                ConnectionArn: 'arn:aws:codeconnections:eu-central-1:664492798177:connection/75bbfa41-fa06-4410-843d-a165aeb828c4',
                FullRepositoryId: 'tp0lajz3r/nginx-cdk-typescript',
                BranchName: 'l1',
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