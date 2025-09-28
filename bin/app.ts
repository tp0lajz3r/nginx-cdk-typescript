#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';
import { VpcStack } from '../lib/vpc-stack';
import { EcsStack } from '../lib/ecs-stack';
import { CognitoStack } from '../lib/cognito-stack';

const app = new cdk.App();
new AppStack(app, 'AppStack', {});
const vpcStack = new VpcStack(app, 'VpcStack', {});
new CognitoStack(app, 'CognitoStack', {});
new EcsStack(app, 'EcsStack', { vpc: vpcStack.vpc });
