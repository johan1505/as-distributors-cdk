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
	SALES_REP_EMAIL: string;
	ALLOWED_ORIGINS: string[];

	// Amplify Stack Configuration
	GITHUB_TOKEN: string;
	GITHUB_OWNER: string;
	GITHUB_REPO: string;
	GITHUB_BRANCH: string;
}

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

function loadEnvConfig(): EnvConfig {
	return {
		CDK_DEFAULT_ACCOUNT: getRequiredEnv("CDK_DEFAULT_ACCOUNT"),
		CDK_DEFAULT_REGION: getRequiredEnv("CDK_DEFAULT_REGION"),
		DOMAIN_NAME: getRequiredEnv("DOMAIN_NAME"),
		SALES_REP_EMAIL: getRequiredEnv("SALES_REP_EMAIL"),
		ALLOWED_ORIGINS: parseCommaSeparatedList(getRequiredEnv("ALLOWED_ORIGINS")),
		GITHUB_TOKEN: getRequiredEnv("GITHUB_TOKEN"),
		GITHUB_OWNER: getRequiredEnv("GITHUB_OWNER"),
		GITHUB_REPO: getRequiredEnv("GITHUB_REPO"),
		GITHUB_BRANCH: getRequiredEnv("GITHUB_BRANCH"),
	};
}

const config = loadEnvConfig();

export default config;
