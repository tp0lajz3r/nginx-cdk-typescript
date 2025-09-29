import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elb from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}


export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: EcsStackProps) {
    super(scope, id, props);

    // ENV variables
    const hostedZoneId = process.env.HOSTED_ZONE_ID;
    const domainName = process.env.DOMAIN_NAME;
    const recordName = process.env.RECORD_NAME;


    //Imported values
    const EcrRepositoryUri = cdk.Fn.importValue('EcrRepositoryUri');

    // Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'MyFargateTaskDef', {
      family: config.ecs.taskDefinitionFamily,
      memoryLimitMiB: config.ecs.taskMemory,
      cpu: config.ecs.taskCpu,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      }
    });

    // Add container to task definition
    const container = taskDefinition.addContainer('nginx-container', {
      image: ecs.ContainerImage.fromRegistry(`${EcrRepositoryUri}:l2`),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: config.ecs.taaskDefinitionFamily }),
      portMappings: [{ containerPort: 80 }],
    });

    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    taskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:*",
          "s3:*",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
      resources: ["*"]
      })
    );

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, 'MyEcsCluster', {
      vpc: props?.vpc,
      clusterName: config.ecs.clusterName,
    });

    cdk.Tags.of(cluster).add('Name', config.ecs.clusterName);
    cdk.Tags.of(cluster).add('env', config.global.env);

    // ACM Certificate

    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'MyHostedZone', {
      hostedZoneId: hostedZoneId!,
      zoneName: domainName!,
    });

    const certificate = new acm.Certificate(this, 'MyCertificate', {
      domainName: domainName!,
      validation: acm.CertificateValidation.fromDns(hostedZone),
      subjectAlternativeNames: ['*.' + domainName!],
    });


    // ECS Service
    const ecsSecurityGroup = new ec2.SecurityGroup(this, 'ECSSecurityGroup', { 
      vpc: props?.vpc!,
      allowAllOutbound: true,
      securityGroupName: config.ecs.ecsSecurityGroupName
    });

    ecsSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(config.vpc.cidrBlock),
      ec2.Port.tcp(80),
    );

    const ecsService = new ecs.FargateService(this, 'MyFargateService', {
      cluster,
      taskDefinition,
      desiredCount: 1,
      assignPublicIp: false,
      serviceName: config.ecs.serviceName,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [ecsSecurityGroup],
    });

    // ALB

    const albSecurityGroup = new ec2.SecurityGroup(this, 'ALBSecurityGroup', { 
      vpc: props?.vpc!,
      allowAllOutbound: true,
      securityGroupName: config.ecs.albSecurityGroupName
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'Allow HTTP traffic from anywhere'
    );

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS traffic from anywhere'
    );

    const alb = new elb.ApplicationLoadBalancer(this, "MyALB", {
      internetFacing: true,
      vpc: props?.vpc!,
      loadBalancerName: config.ecs.loadBalancerName,
      securityGroup: albSecurityGroup
    });

    const ecsTargetGroup = new elb.ApplicationTargetGroup(this, 'ECSTargetGroup', {
      vpc: props?.vpc!,
      port: 80,
      protocol: elb.ApplicationProtocol.HTTP,
      targets: [
        ecsService.loadBalancerTarget({
          containerName: 'nginx-container',
          containerPort: 80,
        }),
      ],
      healthCheck: { path: '/', interval: cdk.Duration.seconds(30) },
      targetGroupName: config.ecs.targetGroupName,
    });

  const listener443 = new elb.CfnListener(this, 'AlbListener', {
    loadBalancerArn: alb.loadBalancerArn,
    port: 443,
    protocol: 'HTTPS',
    sslPolicy: 'ELBSecurityPolicy-2016-08',
    certificates: [
      {
        certificateArn: certificate.certificateArn,
      },
    ],
    defaultActions: [
      {
        type: 'authenticate-cognito',
        authenticateCognitoConfig: {
          userPoolArn: cdk.Fn.importValue('UserPoolArnL2'),
          userPoolClientId: cdk.Fn.importValue('UserPoolClientIdL2'),
          userPoolDomain: cdk.Fn.importValue('UserPoolDomainL2'),
          sessionCookieName: 'AWSELBAuthSessionCookie',
          scope: 'openid',
        },
        order: 1,
      },
      {
        type: 'forward',
        targetGroupArn: ecsTargetGroup.targetGroupArn,
        order: 2,
      },
    ],
  }); 

    const listener_80 = alb.addListener("Listener80", {
      port: 80,
      open: true,
      protocol: elb.ApplicationProtocol.HTTP
    });

    listener_80.addAction('RedirectToHTTPS', {
      action: elb.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true
      })
    });


    // Route53 Alias Record for ALB
    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: recordName!,
      target: route53.RecordTarget.fromAlias(new route53targets.LoadBalancerTarget(alb)),
      ttl: cdk.Duration.minutes(5),
    });

    cdk.Tags.of(alb).add('Name', config.ecs.loadBalancerName);
    cdk.Tags.of(alb).add('env', config.global.env);
    cdk.Tags.of(ecsService).add('Name', config.ecs.serviceName);
    cdk.Tags.of(ecsService).add('env', config.global.env);
    cdk.Tags.of(taskDefinition).add('Name', config.ecs.taskDefinitionFamily);
    cdk.Tags.of(taskDefinition).add('env', config.global.env);

    // Outputs
    new cdk.CfnOutput(this, 'EcsClusterNameL2', {
      value: cluster.clusterName,
      description: 'The name of the ECS cluster',
      exportName: 'EcsClusterNameL2',
    });

    new cdk.CfnOutput(this, 'FargateTaskDefinitionArn', {
      value: taskDefinition.taskDefinitionArn,
      description: 'The ARN of the Fargate task definition',
      exportName: 'FargateTaskDefinitionArn',
    });
  }
}