import { Buffer } from "node:buffer";

export type NormalizedSection = {
	heading: string;
	body: string;
};

export type WorkflowContentInput = {
	pdf_sections?: NormalizedSection[];
	metadata?: Record<string, unknown>;
	pdfFile?: Blob | File | ArrayBuffer | ArrayBufferView | Buffer;
	pdfFileName?: string;
	ingestUrl?: string;
};

type IngestApiResponse = {
	sections: NormalizedSection[];
	metadata?: Record<string, unknown>;
	needsOcr: boolean;
	message?: string;
};

type ResolveOptions = {
	fetchImpl?: typeof fetch;
	baseUrl?: string;
};

export const resolvePdfContent = async (
	input: WorkflowContentInput,
	options: ResolveOptions = {}
) => {
	if (input.pdf_sections && input.pdf_sections.length > 0) {
		return {
			sections: input.pdf_sections,
			metadata: input.metadata ?? {},
		};
	}

	if (!input.pdfFile) {
		throw new Error(
			"Provide either `pdf_sections` or `pdfFile` so the agent has content to teach from."
		);
	}

	const ingestEndpoint =
		input.ingestUrl ??
		process.env.INGEST_API_URL ??
		`${options.baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/ingest`;

	const ingestResponse = await callIngestApi(
		normalizeIngestEndpoint(ingestEndpoint, options.baseUrl),
		input.pdfFile,
		input.pdfFileName,
		options.fetchImpl
	);

	return {
		sections: ingestResponse.sections,
		metadata: input.metadata ?? ingestResponse.metadata ?? {},
	};
};

export const callIngestApi = async (
	endpoint: string,
	fileLike: Blob | File | ArrayBuffer | ArrayBufferView | Buffer,
	fileName?: string,
	fetchImpl: typeof fetch = fetch
): Promise<IngestApiResponse> => {
	const pdfBlob = toPdfBlob(fileLike);
	const formData = new FormData();
	formData.append("file", pdfBlob, fileName ?? "upload.pdf");

	const response = await fetchImpl(endpoint, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(
			`Ingestion API failed (${response.status}): ${await response.text()}`
		);
	}

	const payload = (await response.json()) as IngestApiResponse;

	if (!payload.sections || payload.sections.length === 0) {
		throw new Error("Ingestion API returned no sections.");
	}

	return payload;
};

export const normalizeIngestEndpoint = (endpoint: string, base?: string) => {
	try {
		return new URL(endpoint).toString();
	} catch {
		const fallbackBase = base ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
		return new URL(endpoint, fallbackBase).toString();
	}
};

export const toPdfBlob = (
	fileLike: Blob | File | ArrayBuffer | ArrayBufferView | Buffer
) => {
	if (fileLike instanceof Blob) {
		return fileLike;
	}

	if (typeof Buffer !== "undefined" && Buffer.isBuffer(fileLike)) {
		const buffer = fileLike.buffer as ArrayBuffer;
		const arrayBuffer = buffer.slice(
			fileLike.byteOffset,
			fileLike.byteOffset + fileLike.byteLength
		);
		return new Blob([arrayBuffer], { type: "application/pdf" });
	}

	if (fileLike instanceof ArrayBuffer) {
		return new Blob([fileLike], { type: "application/pdf" });
	}

	if (ArrayBuffer.isView(fileLike)) {
		const buffer = fileLike.buffer as ArrayBuffer;
		const arrayBuffer = buffer.slice(
			fileLike.byteOffset,
			fileLike.byteOffset + fileLike.byteLength
		);
		return new Blob([arrayBuffer], { type: "application/pdf" });
	}

	throw new Error(
		"Unsupported pdfFile type. Provide a Blob, File, Buffer, ArrayBuffer, or TypedArray."
	);
};
