import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { SQSEvent } from "aws-lambda";
import type { QuoteRequestPayload, QuoteItem } from "./types";

const sesClient = new SESClient({});

function getRequiredEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

const SALES_REP_EMAIL = getRequiredEnv("SALES_REP_EMAIL");
const SENDER_EMAIL = getRequiredEnv("SENDER_EMAIL");

/**
 * Formats the quote items into a readable HTML table
 */
function formatQuoteItemsHtml(quoteItems: QuoteItem[], totalPacksRequested: number): string {
	const rows = quoteItems
		.map(
			(item) => `
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.itemNumber}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${item.productName}</td>
      <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
    </tr>
  `
		)
		.join("");

	return `
    <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Item #</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Product</th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">Packs</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
       <tfoot>
        <tr style="background-color: #f5f5f5;">
          <th style="padding: 8px; border: 1px solid #ddd; text-align: left;" colspan="2"><strong>Total</strong></th>
          <th style="padding: 8px; border: 1px solid #ddd; text-align: center;">${totalPacksRequested}</th>
        </tr>
      </tfoot>
    </table>
  `;
}

/**
 * Formats the quote items into plain text
 */
function formatQuoteItemsText(quoteItems: QuoteItem[]): string {
	return quoteItems
		.map((item) => `- [${item.itemNumber}] ${item.productName}: ${item.quantity} pack(s)`)
		.join("\n");
}

/**
 * Generates the email content
 */
function generateEmailContent(quoteRequest: QuoteRequestPayload): {
	subject: string;
	htmlBody: string;
	textBody: string;
} {
	const { contactInfo, quoteItems, metadata } = quoteRequest;

	const subject = `New Quote Request from ${contactInfo.name}`;

	const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
        .section { margin: 20px 0; padding: 15px; background-color: #f9fafb; border-radius: 8px; }
        .section-title { font-weight: bold; margin-bottom: 10px; color: #1f2937; }
        .info-row { margin: 5px 0; }
        .label { font-weight: 600; }
        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Quote Request</h1>
        </div>

        <div class="section">
          <div class="section-title">Customer Contact Information</div>
          <div class="info-row"><span class="label">Name:</span> ${contactInfo.name}</div>
          <div class="info-row"><span class="label">Email:</span> <a href="mailto:${contactInfo.email}">${contactInfo.email}</a></div>
          <div class="info-row"><span class="label">Phone:</span> <a href="tel:${contactInfo.phone}">${contactInfo.phone}</a></div>
        </div>

        <div class="section">
          <div class="section-title">Requested Items</div>
          ${formatQuoteItemsHtml(quoteItems, metadata.totalItems)}
        </div>

        <div class="section">
          <div class="section-title">Request Details</div>
          <div class="info-row"><span class="label">Submitted:</span> ${metadata.submittedAt}</div>
        </div>

        <div class="footer">
          <p>This is an automated message from A & S Distributors quote request system.</p>
          <p>The customer has agreed to be contacted by a sales representative.</p>
        </div>
      </div>
    </body>
    </html>
  `;

	const textBody = `
NEW QUOTE REQUEST
=================

Contact Information
-------------------
Name: ${contactInfo.name}
Email: ${contactInfo.email}
Phone: ${contactInfo.phone}

Requested Items (${metadata.totalUniqueProducts} products, ${metadata.totalItems} total packs)
-------------------
${formatQuoteItemsText(quoteItems)}

Request Details
-------------------
Submitted: ${metadata.submittedAt}

---
This is an automated message from A & S Distributors quote request system.
The customer has agreed to be contacted by a sales representative.
  `.trim();

	return { subject, htmlBody, textBody };
}

/**
 * Lambda handler for processing SQS messages and sending emails
 */
export const handler = async (event: SQSEvent): Promise<void> => {
	console.log("Processing", event.Records.length, "quote request(s)");

	/*
    Note, this is executing one quote request at a time given batchSize = 1

    emailProcessorLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(quoteQueue, {
      batchSize: 1,
    }))
  */
	for (const record of event.Records) {
		try {
			const quoteRequest: QuoteRequestPayload = JSON.parse(record.body);

			const { subject, htmlBody, textBody } = generateEmailContent(quoteRequest);

			const command = new SendEmailCommand({
				Source: SENDER_EMAIL,
				Destination: {
					ToAddresses: [SALES_REP_EMAIL],
				},
				ReplyToAddresses: [quoteRequest.contactInfo.email],
				Message: {
					Subject: {
						Data: subject,
						Charset: "UTF-8",
					},
					Body: {
						Html: {
							Data: htmlBody,
							Charset: "UTF-8",
						},
						Text: {
							Data: textBody,
							Charset: "UTF-8",
						},
					},
				},
			});

			await sesClient.send(command);
			console.log("Email sent successfully");
		} catch (error) {
			console.error("Error processing record:", error);
			// Throwing the error will cause the message to be retried
			// After 3 failures, it will go to the DLQ
			throw error;
		}
	}
};
