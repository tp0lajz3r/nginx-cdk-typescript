import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class CognitoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cognito User Pool
    const userPool = new cognito.CfnUserPool(this, 'DemoUserPool', {
      userPoolName: 'demo-user-pool-l1',
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
      clientName: 'demo-user-pool-client-l1',
      userPoolId: userPool.ref,
      generateSecret: true,
      allowedOAuthFlows: ['code'],
      allowedOAuthScopes: ['openid', 'email'],
      allowedOAuthFlowsUserPoolClient: true,
      supportedIdentityProviders: ['COGNITO'],
      callbackUrLs: ['https://demo-nginx-l1.do-t.tech/oauth2/idpresponse', 'https://demo-nginx-l1.do-t.tech/oauth2/idpresponse/'],
      logoutUrLs: ['https://demo-nginx-l1.do-t.tech/oauth2/idpresponse', 'https://demo-nginx-l1.do-t.tech/oauth2/idpresponse/'],
    });

    // User Pool Domain
    const userPoolDomain = new cognito.CfnUserPoolDomain(this, 'DemoUserPoolDomain', {
      domain: 'demo-user-pool-domain-l1',
      userPoolId: userPool.ref,
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.ref, exportName: 'UserPoolId' } );
    new cdk.CfnOutput(this, 'UserPoolArn', { value: userPool.attrArn, exportName: 'UserPoolArn' } );
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.ref, exportName: 'UserPoolClientId' } );
    new cdk.CfnOutput(this, 'UserPoolDomain', { value: userPoolDomain.domain, exportName: 'UserPoolDomain' } );
  }
}