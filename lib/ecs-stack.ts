import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // Imported values from other stacks
    const ecrUri = cdk.Fn.importValue('ECRRepoURI');
    const privateSubnet1Id = cdk.Fn.importValue('PrivateSubnet1Id');
    const privateSubnet2Id = cdk.Fn.importValue('PrivateSubnet2Id');
    const ecsSecurityGroupId = cdk.Fn.importValue('EcsSecurityGroupId');
    const targetGroupArn = cdk.Fn.importValue('TargetGroupArn');


    // ECS Task Definition
    const ecsTaskExecutionRole = new iam.CfnRole(this, 'EcsTaskExecutionRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
      ],
      roleName: 'ecsTaskExecutionRole',
    });

    const logGroup = new logs.CfnLogGroup(this, 'EcsLogGroup', {
      logGroupName: config.ecs.logGroupName,
      retentionInDays: 7,
      tags: [
        {
          key: 'Name',
          value: 'ecs-log-group',
        },
        {
          key: 'env',
          value: config.global.env,
        }
      ],
    });

    const nginxTaskDefinition = new ecs.CfnTaskDefinition(this, 'NginxTaskDef', {
      family: config.ecs.taskDefinitionFamily,
      cpu: config.ecs.taskCpu,
      memory: config.ecs.taskMemory,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      executionRoleArn: ecsTaskExecutionRole.attrArn,
      runtimePlatform: {
        operatingSystemFamily: 'LINUX',
        cpuArchitecture: 'ARM64',
      },
      containerDefinitions: [
        {
          name: 'nginx-container',
          image: `${ecrUri}:l1`,
          portMappings: [
            {
              containerPort: 80,
              protocol: 'tcp',
            },
          ],
          essential: true,
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': logGroup.logGroupName!,
              'awslogs-region': this.region,
              'awslogs-stream-prefix': 'nginx',
            },
          },
        },
      ],
    });

    const ecsCluster = new ecs.CfnCluster(this, 'EcsCluster', {
      clusterName: config.ecs.clusterName,
      tags: [
        {
          key: 'Name',
          value: config.ecs.clusterName,
        },
        {
          key: 'env',
          value: config.global.env,
        }
      ],
    });


    const ecsService = new ecs.CfnService(this, 'EcsService', {
      cluster: ecsCluster.ref,
      serviceName: config.ecs.serviceName,
      taskDefinition: nginxTaskDefinition.ref,
      desiredCount: 1,
      launchType: 'FARGATE',
      networkConfiguration: {
        awsvpcConfiguration: {
          assignPublicIp: 'DISABLED',
          subnets: [privateSubnet1Id, privateSubnet2Id],
          securityGroups: [ecsSecurityGroupId],
        },
      },
      loadBalancers: [
        {
          targetGroupArn: targetGroupArn,
          containerName: 'nginx-container',
          containerPort: 80,
        },
      ],
      tags: [
        {
          key: 'Name',
          value: config.ecs.serviceName,
        },
        {
          key: 'env',
          value: config.global.env,
        }
      ],
    }); 

    //Outputs
    new cdk.CfnOutput(this, 'EcsTaskDefFamily', {
      value: nginxTaskDefinition.family || '',
      description: 'The family of the ECS Task Definition',
      exportName: 'EcsTaskDefFamily',
    });

    new cdk.CfnOutput(this, 'EcsTaskDefVersion', {
      value: nginxTaskDefinition.ref,
      description: 'The revision of the ECS Task Definition',
      exportName: 'EcsTaskDefVersion',
    });

    new cdk.CfnOutput(this, 'EcsClusterName', {
      value: ecsCluster.clusterName || '',
      description: 'The name of the ECS Cluster',
      exportName: 'EcsClusterName',
    });

    new cdk.CfnOutput(this, 'EcsServiceName', {
      value: ecsService.serviceName || '',
      description: 'The name of the ECS Service',
      exportName: 'EcsServiceName',
    });
  }
}
