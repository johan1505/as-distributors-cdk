import * as dotenv from "dotenv";
import * as path from "node:path";

// Load .env file from the cdk directory
dotenv.config({ path: path.join(__dirname, "../.env") });

interface EnvConfig {
	// AWS Configuration
	CDK_DEFAULT_ACCOUNT: string;
	CDK_DEFAULT_REGION: string;

	// Domain Configuration
	DOMAIN_NAME: string;

	// Quote Request Stack Configuration
	SALE_REP_EMAIL_MAP: Record<"Judith" | "Sanjay", string> & Partial<Record<"Ajay", string>>;
	ALLOWED_ORIGINS: string[];

	// Amplify Stack Configuration
	GITHUB_TOKEN: string;
	GITHUB_OWNER: string;
	GITHUB_REPO: string;
	GITHUB_BRANCH: string;
}

// TODO: Remove optional Ajay once his email is verified
// const SALES_REP_EMAIL_KEYS = ["Judith", "Sanjay", "Ajay"] as const;
// type SalesRepEmailKey = (typeof SALES_REP_EMAIL_KEYS)[number];
const REQUIRED_SALES_REP_EMAIL_KEYS = ["Judith", "Sanjay"] as const;

function getRequiredEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(
			`Missing required environment variable: ${key}. ` +
				`Please copy .env.example to .env and fill in the values.`
		);
	}
	return value;
}

function parseCommaSeparatedList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function isSalesRepEmailMap(
	value: unknown
): value is Record<"Judith" | "Sanjay", string> & Partial<Record<"Ajay", string>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	for (const salesRep of REQUIRED_SALES_REP_EMAIL_KEYS) {
		const email = Reflect.get(value, salesRep);
		if (typeof email !== "string" || email.trim().length === 0) {
			return false;
		}
	}

	const ajayEmail = Reflect.get(value, "Ajay");
	if (ajayEmail !== undefined && (typeof ajayEmail !== "string" || ajayEmail.trim().length === 0)) {
		return false;
	}

	return true;
}

function parseSalesRepEmailMap(
	value: string
): Record<"Judith" | "Sanjay", string> & Partial<Record<"Ajay", string>> {
	let parsed: unknown;

	try {
		parsed = JSON.parse(value);
	} catch {
		throw new Error(
			"Invalid SALES_REP_EMAIL_MAP value. Expected valid JSON, for example: " +
				'{"Judith":"judy.asdistributors@gmail.com","Sanjay":"asdistributors209@gmail.com","Ajay":"aandsdistributors@att.net"}'
		);
	}

	if (!isSalesRepEmailMap(parsed)) {
		throw new Error("Invalid SALES_REP_EMAIL_MAP value. Expected a JSON object.");
	}

	return {
		// Order matters
		Sanjay: parsed.Sanjay.trim(), // Email with CDK resource id at index 0
		Judith: parsed.Judith.trim(), // Email with CDK resource id at index 1
		...(parsed.Ajay ? { Ajay: parsed.Ajay.trim() } : {}), // to be email with resource id at index 2
	};
}

function loadEnvConfig(): EnvConfig {
	const saleRepEmailMap = parseSalesRepEmailMap(getRequiredEnv("SALE_REP_EMAIL_MAP"));

	return {
		CDK_DEFAULT_ACCOUNT: getRequiredEnv("CDK_DEFAULT_ACCOUNT"),
		CDK_DEFAULT_REGION: getRequiredEnv("CDK_DEFAULT_REGION"),
		DOMAIN_NAME: getRequiredEnv("DOMAIN_NAME"),
		SALE_REP_EMAIL_MAP: saleRepEmailMap,
		ALLOWED_ORIGINS: parseCommaSeparatedList(getRequiredEnv("ALLOWED_ORIGINS")),
		GITHUB_TOKEN: getRequiredEnv("GITHUB_TOKEN"),
		GITHUB_OWNER: getRequiredEnv("GITHUB_OWNER"),
		GITHUB_REPO: getRequiredEnv("GITHUB_REPO"),
		GITHUB_BRANCH: getRequiredEnv("GITHUB_BRANCH"),
	};
}

const config = loadEnvConfig();

export default config;
