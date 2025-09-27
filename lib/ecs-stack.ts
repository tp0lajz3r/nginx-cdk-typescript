import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';


export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ECS Cluster
    // ECS Service
    // ALB
    // Security Groups

    // Imported values from other stacks
    const ecrUri = cdk.Fn.importValue('ECRRepoURI');
    const privateSubnet1Id = cdk.Fn.importValue('PrivateSubnet1Id');
    const privateSubnet2Id = cdk.Fn.importValue('PrivateSubnet2Id');
    const vpcId = cdk.Fn.importValue('VPCId');
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
      logGroupName: '/ecs/nginx',
      retentionInDays: 7,
      tags: [
        {
          key: 'Name',
          value: 'ecs-log-group',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const nginxTaskDefinition = new ecs.CfnTaskDefinition(this, 'NginxTaskDef', {
      family: 'nginx-task-def-l1',
      cpu: '256',
      memory: '512',
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
      clusterName: 'demo-ecs-cluster-l1',
      tags: [
        {
          key: 'Name',
          value: 'demo-ecs-cluster-l1',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });


    const ecsService = new ecs.CfnService(this, 'EcsService', {
      cluster: ecsCluster.ref,
      serviceName: 'demo-ecs-service-l1',
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
          value: 'demo-ecs-service-l1',
        },
        {
          key: 'env',
          value: 'demo',
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
