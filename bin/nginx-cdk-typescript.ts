#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { NginxCdkTypescriptStack } from '../lib/nginx-cdk-typescript-stack';
import { VpcStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CognitoStack } from '../lib/cognito-stack';
import { DeployStack } from '../lib/deploy-stack';

const app = new cdk.App();
new NginxCdkTypescriptStack(app, 'NginxCdkTypescriptStack', {});
new VpcStack(app, 'DemoVPC', {});
new EcsStack(app, 'DemoECS', {});
new CognitoStack(app, 'DemoCognito', {});
new DeployStack(app, 'DemoDeploy', {});