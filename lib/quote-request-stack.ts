import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigatewayv2";
import * as apigatewayIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ses from "aws-cdk-lib/aws-ses";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";
import * as path from "node:path";

const LAMBDA_TIMEOUT_SECONDS = 30;
const SQS_VISIBILITY_TIMEOUT_SECONDS = LAMBDA_TIMEOUT_SECONDS * 6;

interface QuoteRequestStackProps extends cdk.StackProps {
	/**
	 * The email address of the sales representative who will receive quote requests.
	 * This email must be verified in SES.
	 */
	salesRepEmail: string;

	/**
	 * The sender email address for quote notifications.
	 * This email must be verified in SES.
	 */
	senderEmail: string;

	/**
	 * Allowed origins for CORS (e.g., your frontend domain)
	 */
	allowedOrigins: string[];
}

export class QuoteRequestStack extends cdk.Stack {
	public readonly apiUrl: string;

	constructor(scope: Construct, id: string, props: QuoteRequestStackProps) {
		super(scope, id, props);

		// SQS Queue for quote requests
		// Using a standard queue with visibility timeout to handle retries
		const quoteQueue = new sqs.Queue(this, "QuoteRequestQueue", {
			queueName: "as-distributors-quote-requests",
			visibilityTimeout: cdk.Duration.seconds(SQS_VISIBILITY_TIMEOUT_SECONDS), // 6x Lambda timeout (30s * 6)      retentionPeriod: cdk.Duration.days(7),
			// Dead letter queue for failed messages
			deadLetterQueue: {
				queue: new sqs.Queue(this, "QuoteRequestDLQ", {
					queueName: "as-distributors-quote-requests-dlq",
					retentionPeriod: cdk.Duration.days(14),
				}),
				maxReceiveCount: 3,
			},
		});

		const senderEmailIdentity = new ses.EmailIdentity(this, "SenderEmailIdentity", {
			identity: ses.Identity.email(props.senderEmail),
		});

		const receipientEmailIdentity = new ses.EmailIdentity(this, "ReceipientEmailIdentity", {
			identity: ses.Identity.email(props.salesRepEmail),
		});

		// Lambda function to process SQS messages and send emails
		// Using NodejsFunction to automatically bundle dependencies
		const emailProcessorLambda = new NodejsFunction(this, "EmailProcessorLambda", {
			functionName: "as-distributors-quote-email-processor",
			runtime: Runtime.NODEJS_LATEST,
			entry: path.join(__dirname, "../lambda/email-processor.ts"),
			handler: "handler",
			timeout: cdk.Duration.seconds(LAMBDA_TIMEOUT_SECONDS),
			memorySize: 256,
			environment: {
				SALES_REP_EMAIL: props.salesRepEmail,
				SENDER_EMAIL: props.senderEmail,
			},
			// TODO: re-enable this once case is approved
			reservedConcurrentExecutions: 3,
			bundling: {
				minify: true,
				sourceMap: true,
			},
		});

		// Grant SES send email permissions to the email processor
		emailProcessorLambda.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["ses:SendEmail", "ses:SendRawEmail"],
				resources: [senderEmailIdentity.emailIdentityArn, receipientEmailIdentity.emailIdentityArn],
			})
		);

		// Add SQS as event source for the email processor
		// batchSize: 1 means each Lambda invocation processes one message
		emailProcessorLambda.addEventSource(
			new lambdaEventSources.SqsEventSource(quoteQueue, {
				batchSize: 1,
			})
		);

		// Lambda function to receive API requests and queue them
		const apiHandlerLambda = new NodejsFunction(this, "ApiHandlerLambda", {
			functionName: "as-distributors-quote-api-handler",
			runtime: Runtime.NODEJS_LATEST,
			entry: path.join(__dirname, "../lambda/api-handler.ts"),
			handler: "handler",
			timeout: cdk.Duration.seconds(10),
			memorySize: 256,
			environment: {
				QUEUE_URL: quoteQueue.queueUrl,
			},
			bundling: {
				minify: true,
				sourceMap: true,
			},
		});

		// Grant the API handler permission to send messages to SQS
		quoteQueue.grantSendMessages(apiHandlerLambda);

		// HTTP API Gateway (cheaper than REST API)
		const httpApi = new apigateway.HttpApi(this, "QuoteRequestApi", {
			apiName: "as-distributors-quote-api",
			description: "API for submitting quote requests",
			corsPreflight: {
				allowOrigins: props.allowedOrigins,
				allowMethods: [apigateway.CorsHttpMethod.POST],
				allowHeaders: ["Content-Type"],
				maxAge: cdk.Duration.days(1),
			},
		});

		// Add POST /quote route with Lambda integration
		httpApi.addRoutes({
			path: "/quote",
			methods: [apigateway.HttpMethod.POST],
			integration: new apigatewayIntegrations.HttpLambdaIntegration(
				"QuoteApiIntegration",
				apiHandlerLambda
			),
		});

		// Add throttling via a stage (HTTP API default stage)
		// Note: HTTP API throttling is configured at the stage level
		const stage = httpApi.defaultStage?.node.defaultChild as apigateway.CfnStage;
		stage.addPropertyOverride("DefaultRouteSettings", {
			ThrottlingBurstLimit: 50, // Max concurrent requests
			ThrottlingRateLimit: 25, // Requests per second
		});

		if (!httpApi.url) {
			throw new Error("API Gateway URL could not be retrieved");
		}

		this.apiUrl = httpApi.url;

		// Outputs
		new cdk.CfnOutput(this, "ApiEndpoint", {
			value: `${httpApi.url}quote`,
			description: "Quote Request API endpoint",
		});
	}
}
