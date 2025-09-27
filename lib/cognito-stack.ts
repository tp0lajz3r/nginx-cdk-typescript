import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as fs from 'fs';

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));

export class CognitoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Env Variables
    const url1 = process.env.COGNITO_URL1;
    const url2 = process.env.COGNITO_URL2;

    if (!url1 || !url2) {
      throw new Error('COGNITO_URL1 and COGNITO_URL2 environment variables must be set');
    }

    // Cognito User Pool
    const userPool = new cognito.CfnUserPool(this, 'DemoUserPool', {
      userPoolName: config.cognito.userPoolName,
      autoVerifiedAttributes: ['email'],
      usernameAttributes: ['email'],
      mfaConfiguration: 'OFF',
      policies: {
        passwordPolicy: {
          minimumLength: 8,
          requireLowercase: true,
          requireNumbers: true,
          requireSymbols: true,
          requireUppercase: true,
        },
      },
      schema: [
        {
          name: 'email',
          required: true,
          mutable: true,
        },
      ],
    });

    // App client
    const userPoolClient = new cognito.CfnUserPoolClient(this, 'DemoUserPoolClient', {
      clientName: config.cognito.userPoolClientName,
      userPoolId: userPool.ref,
      generateSecret: true,
      allowedOAuthFlows: ['code'],
      allowedOAuthScopes: ['openid', 'email'],
      allowedOAuthFlowsUserPoolClient: true,
      supportedIdentityProviders: ['COGNITO'],
      callbackUrLs: [url1!, url2!],
      logoutUrLs: [url1!, url2!],
    });

    // User Pool Domain
    const userPoolDomain = new cognito.CfnUserPoolDomain(this, 'DemoUserPoolDomain', {
      domain: config.cognito.userPoolDomainPrefix,
      userPoolId: userPool.ref,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.ref, exportName: 'UserPoolId' } );
    new cdk.CfnOutput(this, 'UserPoolArn', { value: userPool.attrArn, exportName: 'UserPoolArn' } );
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.ref, exportName: 'UserPoolClientId' } );
    new cdk.CfnOutput(this, 'UserPoolDomain', { value: userPoolDomain.domain, exportName: 'UserPoolDomain' } );
  }
}