#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DomainStack } from "../lib/domain-stack";
import { QuoteRequestStack } from "../lib/quote-request-stack";
import { AmplifyStack } from "../lib/amplify-stack";
import env from "../lib/env";

const app = new cdk.App();

const cdkEnv = {
	account: env.CDK_DEFAULT_ACCOUNT,
	region: env.CDK_DEFAULT_REGION,
};

const domainStack = new DomainStack(app, "AsDistributorsDomain", {
	env: cdkEnv,
	description: "AS Distributors Route 53 hosted zone and ACM certificate",
	domainName: env.DOMAIN_NAME,
});

const quoteRequestStack = new QuoteRequestStack(app, "AsDistributorsQuoteRequest", {
	env: cdkEnv,
	description: "AS Distributors quote request stack",
	salesRepEmail: env.SALES_REP_EMAIL,
	allowedOrigins: env.ALLOWED_ORIGINS,
	hostedZone: domainStack.hostedZone,
});

quoteRequestStack.addDependency(domainStack);

new AmplifyStack(app, "AsDistributorsAmplify", {
	env: cdkEnv,
	description: "AS Distributors Amplify frontend stack",
	githubToken: cdk.SecretValue.unsafePlainText(env.GITHUB_TOKEN),
	githubOwner: env.GITHUB_OWNER,
	githubRepo: env.GITHUB_REPO,
	githubBranch: env.GITHUB_BRANCH,
	quoteApiUrl: quoteRequestStack.apiUrl,
	domainName: env.DOMAIN_NAME,
});
