import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';

export class NginxCdkTypescriptStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const vpcId = cdk.Fn.importValue('VPCId');
    const VPCCidrBlock = cdk.Fn.importValue('VPCCidrBlock');

    // ECR Repository
    const ecrRepo = new ecr.CfnRepository(this, 'demo-nginx', {
      repositoryName: 'demo-nginx',
      imageTagMutability: 'MUTABLE',
      imageScanningConfiguration: {
        scanOnPush: true,
      },
      tags: [
        {
          key: 'Name',
          value: 'demo-nginx',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    // ECS Security Gorup
    const ecsSecurityGroup = new ec2.CfnSecurityGroup(this, 'EcsSecurityGroup', {
      groupName: 'ecs-security-group-l1',
      groupDescription: 'Security group for ECS tasks',
      vpcId: vpcId,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 80,
          toPort: 80,
          cidrIp: VPCCidrBlock
        }
      ],
      securityGroupEgress: [
        {
          ipProtocol: '-1',
          fromPort: 0,
          toPort: 0,
          cidrIp: '0.0.0.0/0'
        }
      ],
      tags: [
        {
          key: 'Name',
          value: 'ecs-security-group-l1',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });
  
  // ALB
  // ACM
  const hostedZoneId = 'Z07413872C5IBFYJ4VZ9';
  const certificate = new acm.CfnCertificate(this, 'do-tCertificate', {
    domainName: 'do-t.tech',
    validationMethod: 'DNS',
    domainValidationOptions: [
      {
        domainName: 'do-t.tech',
        hostedZoneId: hostedZoneId,
      },
    ],
    subjectAlternativeNames: ['*.do-t.tech'],
    tags: [
      {
        key: 'Name',
        value: 'demo-acm-certificate',
      },
      {
        key: 'env',
        value: 'demo',
      }
    ],
  });

  // Security Group
  const albSecurityGroup = new ec2.CfnSecurityGroup(this, 'AlbSecurityGroup', {
    groupName: 'alb-security-group-l1',
    groupDescription: 'Security group for ALB',
    vpcId: vpcId,
    securityGroupIngress: [
      {
        ipProtocol: 'tcp',
        fromPort: 80,
        toPort: 80,
        cidrIp: '0.0.0.0/0'
      },
      {
        ipProtocol: 'tcp',
        fromPort: 443,
        toPort: 443,
        cidrIp: '0.0.0.0/0'
      }
    ],
    securityGroupEgress: [
      {
        ipProtocol: '-1',
        fromPort: 0,
        toPort: 0,
        cidrIp: '0.0.0.0/0' 
      }
    ],
    tags: [
      {
        key: 'Name',
        value: 'alb-security-group-l1',
      },
      {
        key: 'env',
        value: 'demo',
      }
    ],
  });

  // Target Group
  const targetGroup = new elbv2.CfnTargetGroup(this, 'AlbTargetGroup', {
    name: 'alb-target-group-l1',
    port: 80,
    protocol: 'HTTP',
    vpcId: vpcId,
    healthCheckPath: '/',
    healthCheckIntervalSeconds: 15,
    healthCheckTimeoutSeconds: 10,
    healthyThresholdCount: 2,
    unhealthyThresholdCount: 5,
    targetType: 'ip',
    tags: [
      {
        key: 'Name',
        value: 'alb-target-group-l1',
      },
      {
        key: 'env',
        value: 'demo',
      }
    ],
  });

  // Load Balancer
  const loadBalancer = new elbv2.CfnLoadBalancer(this, 'ApplicationLoadBalancer', {
    name: 'application-load-balancer-l1',
    subnets: [
      cdk.Fn.importValue('PublicSubnet1Id'),
      cdk.Fn.importValue('PublicSubnet2Id')
    ],
    securityGroups: [albSecurityGroup.ref],
    scheme: 'internet-facing',
    type: 'application',
    tags: [
      {
        key: 'Name',
        value: 'application-load-balancer-l1',
      },
      {
        key: 'env',
        value: 'demo',
      }
    ],
  });

  // Listener
  const listener443 = new elbv2.CfnListener(this, 'AlbListener', {
    loadBalancerArn: loadBalancer.ref,
    port: 443,
    protocol: 'HTTPS',
    sslPolicy: 'ELBSecurityPolicy-2016-08',
    certificates: [
      {
        certificateArn: certificate.ref,
      },
    ],
    defaultActions: [
      {
        type: 'authenticate-cognito',
        authenticateCognitoConfig: {
          userPoolArn: cdk.Fn.importValue('UserPoolArn'),
          userPoolClientId: cdk.Fn.importValue('UserPoolClientId'),
          userPoolDomain: cdk.Fn.importValue('UserPoolDomain'),
          sessionCookieName: 'AWSELBAuthSessionCookie',
          scope: 'openid',
        },
        order: 1,
      },
      {
        type: 'forward',
        targetGroupArn: targetGroup.ref,
        order: 2,
      },
    ],
  }); 

  const listener80 = new elbv2.CfnListener(this, 'AlbListener80', {
    loadBalancerArn: loadBalancer.ref,
    port: 80,
    protocol: 'HTTP',
    defaultActions: [
      {
        type: 'redirect',
        redirectConfig: {
          protocol: 'HTTPS',
          port: '443',
          statusCode: 'HTTP_301',
        },
      },
    ],
  });

  // Route53 A Record

  const albRecords = new route53.CfnRecordSet(this, 'AlbRecord', {
    name: 'demo-nginx-l1.do-t.tech.',
    type: 'A',
    hostedZoneId: hostedZoneId,
    aliasTarget: {
      dnsName: loadBalancer.attrDnsName,
      hostedZoneId: loadBalancer.attrCanonicalHostedZoneId,
      evaluateTargetHealth: false,
    },
  });


  // Outputs
  new cdk.CfnOutput(this, 'ECRRepoURI', {
      value: ecrRepo.attrRepositoryUri,
      description: 'The URI of the ECR repository',
      exportName: 'ECRRepoURI',
    });

  new cdk.CfnOutput(this, 'ECRRepoName', {
      value: ecrRepo.repositoryName || '',
      description: 'The name of the ECR repository',
      exportName: 'ECRRepoName',
    });

  new cdk.CfnOutput(this, 'EcsSecurityGroupId', { value: ecsSecurityGroup.ref, exportName: 'EcsSecurityGroupId' } );
  new cdk.CfnOutput(this, 'TargetGroupArn', { value: targetGroup.ref, exportName: 'TargetGroupArn' } );
  }
}
