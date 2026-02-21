import * as cdk from "aws-cdk-lib";
import * as amplify from "aws-cdk-lib/aws-amplify";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";

interface AmplifyStackProps extends cdk.StackProps {
	/**
	 * GitHub OAuth token for accessing the repository.
	 * Must have repo permissions.
	 */
	githubToken: cdk.SecretValue;

	/**
	 * GitHub repository owner (username or organization).
	 */
	githubOwner: string;

	/**
	 * GitHub repository name.
	 */
	githubRepo: string;

	/**
	 * Git branch to deploy.
	 */
	githubBranch: string;

	/**
	 * The API Gateway URL from the QuoteRequestStack.
	 * Will be exposed as NEXT_PUBLIC_QUOTE_API_URL environment variable.
	 */
	quoteApiUrl: string;

	/**
	 * The custom domain name to associate with the Amplify app.
	 */
	domainName: string;
}

export class AmplifyStack extends cdk.Stack {
	public readonly amplifyApp: amplify.CfnApp;
	public readonly amplifyBranch: amplify.CfnBranch;

	constructor(scope: Construct, id: string, props: AmplifyStackProps) {
		super(scope, id, props);

		// Build spec for Next.js SSG
		const buildSpec = `
version: 1
frontend:
    phases:
        build:
            commands:
                - 'npm run deploy'
    artifacts:
        baseDirectory: /out
        files:
            - '**/*'
    cache:
        paths: []
`;

		// Custom headers for caching. Keep _next assets cached forever in the browser, else don't cache always fetch from CDN
		const customHeaders = `
customHeaders:
  - pattern: _next/**
    headers:
      - key: Cache-Control
        value: public, max-age=31536000, immutable
  - pattern: "*"
    headers:
      - key: Cache-Control
        value: max-age=0, s-maxage=600, must-revalidate
`;

		// IAM role for Amplify to use during builds
		// Include both global and regional service principals
		const amplifyRole = new iam.Role(this, "AmplifyServiceRole", {
			assumedBy: new iam.CompositePrincipal(
				new iam.ServicePrincipal("amplify.amazonaws.com"),
				new iam.ServicePrincipal(`amplify.${this.region}.amazonaws.com`)
			),
			description: "Service role for Amplify to build and deploy the frontend",
		});

		// Add managed policy for Amplify Gen 2 backend deployment
		amplifyRole.addManagedPolicy(
			iam.ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess-Amplify")
		);

		// Create Amplify App
		this.amplifyApp = new amplify.CfnApp(this, "AmplifyApp", {
			name: "as-distributors-frontend",
			description: "AS Distributors Next.js frontend application",
			repository: `https://github.com/${props.githubOwner}/${props.githubRepo}`,
			accessToken: props.githubToken.unsafeUnwrap(),
			platform: "WEB",
			buildSpec,
			customHeaders,
			iamServiceRole: amplifyRole.roleArn,
			environmentVariables: [
				{
					name: "NEXT_PUBLIC_QUOTE_API_URL",
					value: props.quoteApiUrl,
				},
			],
		});

		// Create branch
		this.amplifyBranch = new amplify.CfnBranch(this, "AmplifyBranch", {
			appId: this.amplifyApp.attrAppId,
			branchName: props.githubBranch,
			enableAutoBuild: true,
			stage: "PRODUCTION",
		});

		new amplify.CfnDomain(this, "AmplifyDomain", {
			appId: this.amplifyApp.attrAppId,
			domainName: props.domainName,
			subDomainSettings: [
				{
					branchName: this.amplifyBranch.branchName,
					prefix: "",
				},
				{
					branchName: this.amplifyBranch.branchName,
					prefix: "www",
				},
			],
		});

		new cdk.CfnOutput(this, "AmplifyAppUrl", {
			value: `https://${props.githubBranch}.${this.amplifyApp.attrDefaultDomain}`,
			description: "Amplify App URL",
		});
	}
}
