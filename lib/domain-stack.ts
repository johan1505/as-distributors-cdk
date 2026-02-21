import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import type { Construct } from "constructs";

interface DomainStackProps extends cdk.StackProps {
	domainName: string;
}

export class DomainStack extends cdk.Stack {
	public readonly hostedZone: route53.IHostedZone;
	public readonly certificate: acm.ICertificate;

	constructor(scope: Construct, id: string, props: DomainStackProps) {
		super(scope, id, props);

		this.hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
			domainName: props.domainName,
		});

		this.certificate = new acm.Certificate(this, "Certificate", {
			domainName: props.domainName,
			subjectAlternativeNames: [`*.${props.domainName}`],
			validation: acm.CertificateValidation.fromDns(this.hostedZone),
		});

		new cdk.CfnOutput(this, "HostedZoneId", {
			value: this.hostedZone.hostedZoneId,
			description: "Route 53 Hosted Zone ID",
		});

		new cdk.CfnOutput(this, "CertificateArn", {
			value: this.certificate.certificateArn,
			description: "ACM Certificate ARN",
		});
	}
}
