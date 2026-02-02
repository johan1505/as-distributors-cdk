import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { QuoteRequestPayload } from "./types";

const sqsClient = new SQSClient({});

const QUEUE_URL = process.env["QUEUE_URL"];

/**
 * Validates the quote request payload
 */
function validatePayload(body: QuoteRequestPayload): string[] {
	const errors: string[] = [];

	if (!body.contactInfo) {
		errors.push("contactInfo is required");
	} else {
		if (!body.contactInfo.name || body.contactInfo.name.trim() === "") {
			errors.push("name is required");
		}
		if (!body.contactInfo.email || body.contactInfo.email.trim() === "") {
			errors.push("email is required");
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contactInfo.email)) {
			errors.push("email is invalid");
		}
		if (!body.contactInfo.phone || body.contactInfo.phone.trim() === "") {
			errors.push("phone is required");
		}
	}

	if (!body.quoteItems || !Array.isArray(body.quoteItems)) {
		errors.push("quoteItems must be an array");
	} else if (body.quoteItems.length === 0) {
		errors.push("quoteItems cannot be empty");
	} else {
		body.quoteItems.forEach((item, index) => {
			if (!item.productName) {
				errors.push(`quoteItems[${index}].productName is required`);
			}
			if (typeof item.quantity !== "number" || item.quantity < 1) {
				errors.push(`quoteItems[${index}].quantity must be a positive number`);
			}
		});
	}

	if (typeof body.agreedToContact !== "boolean" || !body.agreedToContact) {
		errors.push("agreedToContact must be true");
	}

	return errors;
}

/**
 * Lambda handler for quote request API
 */
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
	const headers = {
		"Content-Type": "application/json",
	};

	try {
		// Parse request body
		let body: QuoteRequestPayload;
		try {
			body = JSON.parse(event.body || "{}");
		} catch {
			return {
				statusCode: 400,
				headers,
				body: JSON.stringify({
					success: false,
					error: "Invalid JSON in request body",
				}),
			};
		}

		// Validate payload
		const validationErrors = validatePayload(body);
		if (validationErrors.length > 0) {
			return {
				statusCode: 400,
				headers,
				body: JSON.stringify({
					success: false,
					error: "Validation failed",
					details: validationErrors,
				}),
			};
		}

		console.log("Putting request in queue...");
		console.log(`Source ip: ${event.requestContext?.http?.sourceIp || "unknown"}`);
		console.log(`User agent: ${event.headers?.["user-agent"] || "unknown"}`);

		// Send to SQS queue
		const command = new SendMessageCommand({
			QueueUrl: QUEUE_URL,
			MessageBody: JSON.stringify(body),
			MessageAttributes: {
				email: {
					DataType: "String",
					StringValue: body.contactInfo.email,
				},
			},
		});

		await sqsClient.send(command);

		return {
			statusCode: 200,
			headers,
			body: JSON.stringify({
				success: true,
				message: "Quote request submitted successfully",
			}),
		};
	} catch (error) {
		console.error("Error processing quote request:", error);

		return {
			statusCode: 500,
			headers,
			body: JSON.stringify({
				success: false,
				error: "Internal server error. Please try again later.",
			}),
		};
	}
};
