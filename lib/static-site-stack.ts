import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";
import { Construct } from "constructs";

export class StaticSiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket - Private, no public access
    this.websiteBucket = new s3.Bucket(this, "WebsiteBucket", {
      bucketName: "a-and-s-distributors",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // CloudFront Function for URL rewriting
    // Handles trailingSlash: true from Next.js config
    const urlRewriteFunction = new cloudfront.Function(
      this,
      "UrlRewriteFunction",
      {
        functionName: `${id}-UrlRewrite`,
        comment: "Append index.html to directory requests",
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // If URI ends with /, append index.html
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  }
  // If URI doesn't have a file extension and doesn't end with /,
  // treat it as a directory and append /index.html
  else if (!uri.includes('.') || uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    request.uri = uri + '/index.html';
  }

  return request;
}
      `),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
      },
    );

    // Cache Policy for HTML files - 1 month TTL
    const htmlCachePolicy = new cloudfront.CachePolicy(
      this,
      "HtmlCachePolicy",
      {
        cachePolicyName: `${id}-HTML`,
        comment: "Cache policy for HTML files - 1 month TTL",
        defaultTtl: cdk.Duration.days(30),
        minTtl: cdk.Duration.seconds(1),
        maxTtl: cdk.Duration.days(365),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    // Cache Policy for immutable assets - 1 year TTL
    const immutableCachePolicy = new cloudfront.CachePolicy(
      this,
      "ImmutableCachePolicy",
      {
        cachePolicyName: `${id}-Immutable`,
        comment: "Cache policy for content-hashed assets - 1 year TTL",
        defaultTtl: cdk.Duration.days(365),
        minTtl: cdk.Duration.days(365),
        maxTtl: cdk.Duration.days(365),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
      },
    );

    // Response Headers Policy for HTML - no-cache (browser always revalidates)
    const htmlResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "HtmlResponseHeadersPolicy",
      {
        responseHeadersPolicyName: `${id}-HTML-Headers`,
        comment: "Cache-Control: no-cache for HTML files",
        customHeadersBehavior: {
          customHeaders: [
            {
              header: "Cache-Control",
              value: "no-cache",
              override: true,
            },
          ],
        },
      },
    );

    // Response Headers Policy for immutable assets - 1 year cache
    const immutableResponseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "ImmutableResponseHeadersPolicy",
      {
        responseHeadersPolicyName: `${id}-Immutable-Headers`,
        comment: "Cache-Control: 1 year immutable for hashed assets",
        customHeadersBehavior: {
          customHeaders: [
            {
              header: "Cache-Control",
              value: "public, max-age=31536000, immutable",
              override: true,
            },
          ],
        },
      },
    );

    // S3 Origin with OAC
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(
      this.websiteBucket,
    );

    // CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "AS Distributors Static Site",
      defaultRootObject: "index.html",
      // Default behavior for HTML/general content
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
        cachePolicy: htmlCachePolicy,
        responseHeadersPolicy: htmlResponseHeadersPolicy,
        compress: true,
        functionAssociations: [
          {
            function: urlRewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },

      // Additional behavior for immutable static assets
      additionalBehaviors: {
        "_next/*": {
          origin: s3Origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
          cachePolicy: immutableCachePolicy,
          responseHeadersPolicy: immutableResponseHeadersPolicy,
          compress: true,
        },
      },

      // Custom error responses
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/404.html",
          ttl: cdk.Duration.minutes(5),
        },
      ],

      // Performance settings
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
    });

    // Deploy all static files to S3
    new s3deploy.BucketDeployment(this, "DeployWebsite", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../frontend/out")),
      ],
      destinationBucket: this.websiteBucket,
      prune: true,
      memoryLimit: 512,
      distribution: this.distribution,
      distributionPaths: ["/*"],
    });

    // Outputs
    new cdk.CfnOutput(this, "DistributionDomainName", {
      value: this.distribution.distributionDomainName,
      description: "CloudFront Distribution Domain Name",
    });

    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    new cdk.CfnOutput(this, "BucketName", {
      value: this.websiteBucket.bucketName,
      description: "S3 Bucket Name",
    });
  }
}
