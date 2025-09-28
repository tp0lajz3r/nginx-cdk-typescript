import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ecrRepository = new ecr.Repository(this, 'MyEcrRepository', {
      repositoryName: config.nginx.ecrRepositoryName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
    });

    cdk.Tags.of(ecrRepository).add('Name', config.nginx.ecrRepositoryName);
    cdk.Tags.of(ecrRepository).add('env', config.global.env);


    // Outputs
    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepository.repositoryUri,
      description: 'The URI of the ECR repository',
      exportName: 'EcrRepositoryUri',
    });   
     
    new cdk.CfnOutput(this, 'EcrRepositoryName', {
      value: ecrRepository.repositoryName,
      description: 'The name of the ECR repository',
      exportName: 'EcrRepositoryName',
    });
  }
}
