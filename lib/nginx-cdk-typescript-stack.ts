import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

export class NginxCdkTypescriptStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // ENV variables
    const hostedZoneId = process.env.HOSTED_ZONE_ID || config.nginx.hostedZoneId;
    const domainName = process.env.DOMAIN_NAME || config.nginx.domainName;
    const recordName = process.env.RECORD_NAME || config.nginx.recordName;
    
    // Validate required environment variables
    if (!hostedZoneId) {
      throw new Error('HOSTED_ZONE_ID environment variable is not set and not found in config.json');
    }
    if (!domainName) {
      throw new Error('DOMAIN_NAME environment variable is not set and not found in config.json');
    }
    if (!recordName) {
      throw new Error('RECORD_NAME environment variable is not set and not found in config.json');
    } 


    // Imported values from other stacks
    const vpcId = cdk.Fn.importValue('VPCId');
    const VPCCidrBlock = cdk.Fn.importValue('VPCCidrBlock');

    // ECR Repository
    const ecrRepo = new ecr.CfnRepository(this, 'demo-nginx', {
      repositoryName: config.nginx.ecrRepositoryName,
      imageTagMutability: 'MUTABLE',
      imageScanningConfiguration: {
        scanOnPush: true,
      },
      tags: [
        {
          key: 'Name',
          value: config.nginx.ecrRepositoryName,
        },
        {
          key: 'env',
          value: config.global.env,
        }
      ],
    });

    // ECS Security Gorup
    const ecsSecurityGroup = new ec2.CfnSecurityGroup(this, 'EcsSecurityGroup', {
      groupName: config.nginx.ecsSecurityGroupName,
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
          value: config.nginx.ecsSecurityGroupName,
        },
        {
          key: 'env',
          value: config.global.env,
        }
      ],
    });
  
  // ALB
  // ACM
  const certificate = new acm.CfnCertificate(this, 'do-tCertificate', {
    domainName: domainName,
    validationMethod: 'DNS',
    domainValidationOptions: [
      {
        domainName: domainName,
        hostedZoneId: hostedZoneId,
      },
    ],
    subjectAlternativeNames: ['*.' + domainName],
    tags: [
      {
        key: 'env',
        value: config.global.env,
      }
    ],
  });

  // Security Group
  const albSecurityGroup = new ec2.CfnSecurityGroup(this, 'AlbSecurityGroup', {
    groupName: config.nginx.albSecurityGroupName,
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
        value: config.nginx.albSecurityGroupName,
      },
      {
        key: 'env',
        value: config.global.env,
      }
    ],
  });

  // Target Group
  const targetGroup = new elbv2.CfnTargetGroup(this, 'AlbTargetGroup', {
    name: config.nginx.targetGroupName,
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
        value: config.nginx.targetGroupName,
      },
      {
        key: 'env',
        value: config.global.env,
      }
    ],
  });

  // Load Balancer
  const loadBalancer = new elbv2.CfnLoadBalancer(this, 'ApplicationLoadBalancer', {
    name: config.nginx.loadBalancerName,
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
        value: config.nginx.loadBalancerName,
      },
      {
        key: 'env',
        value: config.global.env,
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
    name: recordName,
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
