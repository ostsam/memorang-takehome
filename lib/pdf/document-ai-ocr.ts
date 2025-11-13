import { Buffer } from "node:buffer";

import { GoogleAuth, type AuthClient } from "google-auth-library";

const DOCUMENT_AI_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type DocumentAiConfig = {
	projectId: string;
	location: string;
	processorId: string;
};

let cachedConfig: DocumentAiConfig | null = null;
let authClientPromise: Promise<AuthClient> | null = null;

export interface DocumentAiOcrResult {
	text: string;
	pageCount: number;
	warnings: string[];
	rawResponse?: unknown;
}

function loadConfig(): DocumentAiConfig {
	if (cachedConfig) {
		return cachedConfig;
	}

	const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
	const location =
		process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us"; // Document AI default
	const processorId = process.env.GOOGLE_CLOUD_PROCESSOR_ID?.trim();

	if (!projectId || !processorId) {
		throw new Error(
			"Document AI OCR requires GOOGLE_CLOUD_PROJECT_ID and GOOGLE_CLOUD_PROCESSOR_ID environment variables."
		);
	}

	cachedConfig = {
		projectId,
		location,
		processorId,
	};

	return cachedConfig;
}

async function getAuthHeaders(
	config: DocumentAiConfig
): Promise<Record<string, string>> {
	if (!authClientPromise) {
		const auth = new GoogleAuth({
			scopes: [DOCUMENT_AI_SCOPE],
		});
		authClientPromise = auth.getClient();
	}

	const client = await authClientPromise;
	const tokenResponse = await client.getAccessToken();
	const token =
		typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;

	if (!token) {
		throw new Error("Document AI OCR could not obtain an access token.");
	}

	return {
		Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
	};
}

type DocumentAiProcessResponse = {
	document?: {
		text?: string;
		pages?: Array<{
			pageNumber?: number;
		}>;
	};
};

export async function runDocumentAiOcr(
	buffer: Buffer | Uint8Array
): Promise<DocumentAiOcrResult> {
	const config = loadConfig();
	const body = {
		rawDocument: {
			content: Buffer.from(buffer).toString("base64"),
			mimeType: "application/pdf",
		},
	};

	const endpoint = `https://${config.location}-documentai.googleapis.com/v1/projects/${config.projectId}/locations/${config.location}/processors/${config.processorId}:process`;
	const url = endpoint;

	const headers: Record<string, string> = {
		"Content-Type": "application/json; charset=utf-8",
			...(await getAuthHeaders(config)),
	};

	let response: Response;

	try {
		response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});
	} catch (networkError) {
		console.error("[ocr] Document AI network error", networkError);
		throw new Error("Failed to call Document AI OCR service.");
	}

	if (!response.ok) {
		const errorText = await response.text();
		console.error("[ocr] Document AI request failed", response.status, errorText);
		throw new Error(`Document AI OCR failed with status ${response.status}`);
	}

	const payload = (await response.json()) as DocumentAiProcessResponse;
	const text = payload.document?.text?.trim() ?? "";
	const pageCount = payload.document?.pages?.length ?? 0;

	return {
		text,
		pageCount,
		warnings: [],
		rawResponse: payload,
	};
}

export function __resetDocumentAiConfigForTests() {
	cachedConfig = null;
	authClientPromise = null;
}
