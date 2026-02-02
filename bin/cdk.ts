#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { QuoteRequestStack } from "../lib/quote-request-stack";
import { AmplifyStack } from "../lib/amplify-stack";
import env from "../lib/env";

const app = new cdk.App();

const quoteRequestStack = new QuoteRequestStack(app, "AsDistributorsQuoteRequest", {
	env: {
		account: env.CDK_DEFAULT_ACCOUNT,
		region: env.CDK_DEFAULT_REGION,
	},
	description: "AS Distributors quote request stack",
	salesRepEmail: env.SALES_REP_EMAIL,
	senderEmail: env.SENDER_EMAIL,
	allowedOrigins: env.ALLOWED_ORIGINS ?? [],
});

new AmplifyStack(app, "AsDistributorsAmplify", {
	env: {
		account: env.CDK_DEFAULT_ACCOUNT,
		region: env.CDK_DEFAULT_REGION,
	},
	description: "AS Distributors Amplify frontend stack",
	githubToken: cdk.SecretValue.unsafePlainText(env.GITHUB_TOKEN),
	githubOwner: env.GITHUB_OWNER,
	githubRepo: env.GITHUB_REPO,
	githubBranch: env.GITHUB_BRANCH,
	quoteApiUrl: quoteRequestStack.apiUrl,
});
