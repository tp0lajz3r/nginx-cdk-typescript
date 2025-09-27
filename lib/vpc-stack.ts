import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';


export class VpcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const azs = cdk.Stack.of(this).availabilityZones.slice(0, 2);

    const vpc = new ec2.CfnVPC(this, 'demo-vpc', {
      cidrBlock: '10.60.0.0/16',
      enableDnsHostnames: true,
      enableDnsSupport: true,
      tags: [
        {
          key: 'Name',
          value: 'demo-vpc',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],

    });

    const privateSubnet1 = new ec2.CfnSubnet(this, 'demo-private-subnet-1', {
      vpcId: vpc.ref,
      cidrBlock: '10.60.0.0/22',
      availabilityZone: azs[0],
      tags: [
        {
          key: 'Name',
          value: 'demo-private-subnet-1',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const privateSubnet2 = new ec2.CfnSubnet(this, 'demo-private-subnet-2', {
      vpcId: vpc.ref,
      cidrBlock: '10.60.4.0/22',
      availabilityZone: azs[1],
      tags: [
        {
          key: 'Name',
          value: 'demo-private-subnet-2',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const publicSubnet1 = new ec2.CfnSubnet(this, 'demo-public-subnet-1', {
      vpcId: vpc.ref,
      cidrBlock: '10.60.32.0/24',
      availabilityZone: azs[0],
      mapPublicIpOnLaunch: true,
      tags: [
        {
          key: 'Name',
          value: 'demo-public-subnet-1',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const publicSubnet2 = new ec2.CfnSubnet(this, 'demo-public-subnet-2', {
      vpcId: vpc.ref,
      cidrBlock: '10.60.33.0/24',
      availabilityZone: azs[1],
      mapPublicIpOnLaunch: true,
      tags: [
        {
          key: 'Name',
          value: 'demo-public-subnet-2',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const igw = new ec2.CfnInternetGateway(this, 'demo-igw', {
      tags: [
        {
          key: 'Name',
          value: 'demo-igw',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    new ec2.CfnVPCGatewayAttachment(this, 'demo-vpc-igw-attachment', {
      vpcId: vpc.ref,
      internetGatewayId: igw.ref,
    });

    const publicRouteTable = new ec2.CfnRouteTable(this, 'demo-public-rt', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'demo-public-rt',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    new ec2.CfnRoute(this, 'demo-public-route', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: igw.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'demo-public-subnet-1-assoc', {
      subnetId: publicSubnet1.ref,
      routeTableId: publicRouteTable.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'demo-public-subnet-2-assoc', {
      subnetId: publicSubnet2.ref,
      routeTableId: publicRouteTable.ref,
    });

    const eip1 = new ec2.CfnEIP(this, 'demo-nat-eip-1', {
      domain: 'vpc',
      tags: [
        {
          key: 'Name',
          value: 'demo-nat-eip-1',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const natGw = new ec2.CfnNatGateway(this, 'demo-nat-gw-1', {
      subnetId: publicSubnet1.ref,
      allocationId: eip1.attrAllocationId,
      tags: [
        {
          key: 'Name',
          value: 'demo-nat-gw-1',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    const privateRouteTable = new ec2.CfnRouteTable(this, 'demo-private-rt', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'demo-private-rt',
        },
        {
          key: 'env',
          value: 'demo',
        }
      ],
    });

    new ec2.CfnRoute(this, 'demo-private-route', {
      routeTableId: privateRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGw.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'demo-private-subnet-1-assoc', {
      subnetId: privateSubnet1.ref,
      routeTableId: privateRouteTable.ref,
    });

    new ec2.CfnSubnetRouteTableAssociation(this, 'demo-private-subnet-2-assoc', {
      subnetId: privateSubnet2.ref,
      routeTableId: privateRouteTable.ref,
    });

    // Outputs
    new cdk.CfnOutput(this, 'VpcId', { value: vpc.ref, exportName: 'VPCId' });
    new cdk.CfnOutput(this, 'VPCCidrBlock', { value: vpc.cidrBlock || '', exportName: 'VPCCidrBlock' });
    new cdk.CfnOutput(this, 'PublicSubnet1Id', { value: publicSubnet1.ref, exportName: 'PublicSubnet1Id' });
    new cdk.CfnOutput(this, 'PublicSubnet2Id', { value: publicSubnet2.ref, exportName: 'PublicSubnet2Id' });
    new cdk.CfnOutput(this, 'PrivateSubnet1Id', { value: privateSubnet1.ref, exportName: 'PrivateSubnet1Id' });
    new cdk.CfnOutput(this, 'PrivateSubnet2Id', { value: privateSubnet2.ref, exportName: 'PrivateSubnet2Id' });
  } 
}