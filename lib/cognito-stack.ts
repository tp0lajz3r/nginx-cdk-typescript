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
    const userPool = new cognito.UserPool(this, 'MyUserPool', {
      userPoolName: config.cognito.userPoolName,
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      signInAliases: { email: true },
      mfa: cognito.Mfa.OFF,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      }
    });

    // Cognito User Pool Client
    const userPoolCLient = userPool.addClient('UserPoolClient', {
      userPoolClientName: config.cognito.userPoolClientName,
      generateSecret: true,
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [url1!, url2!],
        logoutUrls: [url1!, url2!],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // Cognito Domain
    const userPoolDomain = userPool.addDomain('CognitoDomain', {
      cognitoDomain: {
        domainPrefix: config.cognito.userPoolDomainPrefix,
      },
    });

    cdk.Tags.of(userPool).add('Name', config.global.userPoolName);
    cdk.Tags.of(userPool).add('env', config.global.env);

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'The ID of the Cognito User Pool',
      exportName: 'UserPoolIdL2',
    });

    new cdk.CfnOutput(this, 'UserPoolArn', {
      value: userPool.userPoolArn,
      description: 'The ARN of the Cognito User Pool',
      exportName: 'UserPoolArnL2',
    });

    new cdk.CfnOutput(this, 'UserPoolProviderUrl', {
      value: userPool.userPoolProviderUrl,
      description: 'The Provider URL of the Cognito User Pool',
      exportName: 'UserPoolProviderUrlL2',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolCLient.userPoolClientId,
      description: 'The Client ID of the Cognito User Pool Client',
      exportName: 'UserPoolClientIdL2',
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'The Domain of the Cognito User Pool',
      exportName: 'UserPoolDomainL2',
    });
  }
}