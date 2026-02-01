#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { QuoteRequestStack } from "../lib/quote-request-stack";
import env from "../lib/env";

const app = new cdk.App();

new QuoteRequestStack(app, "AsDistributorsQuoteRequest", {
    env: {
      account: env?.CDK_DEFAULT_ACCOUNT,
      region: env?.CDK_DEFAULT_REGION,
    },
    description: "AS Distributors quote request stack",
    salesRepEmail: env?.SALES_REP_EMAIL!,
    senderEmail: env?.SENDER_EMAIL!,
    allowedOrigins: env?.ALLOWED_ORIGINS ?? [],
  })