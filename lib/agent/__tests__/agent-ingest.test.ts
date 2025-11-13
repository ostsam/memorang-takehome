import { describe, expect, it, vi } from "vitest";

import {
	normalizeIngestEndpoint,
	resolvePdfContent,
	toPdfBlob,
	type NormalizedSection,
} from "../agent-ingest";

const sampleSections: NormalizedSection[] = [
	{ heading: "Intro", body: "Body text" },
];

describe("resolvePdfContent", () => {
	it("returns inline sections without calling ingest", async () => {
		const result = await resolvePdfContent({
			pdf_sections: sampleSections,
			metadata: { title: "Doc" },
		});

		expect(result.sections).toEqual(sampleSections);
		expect(result.metadata).toEqual({ title: "Doc" });
	});

	it("fetches ingest data when pdfFile is provided", async () => {
		const responsePayload = {
			sections: [{ heading: "Generated", body: "Extracted" }],
			needsOcr: false,
		};

		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify(responsePayload), { status: 200 });
		});

		const arrayBuffer = new TextEncoder().encode("PDF").buffer;

		const result = await resolvePdfContent(
			{
				pdfFile: arrayBuffer,
				pdfFileName: "sample.pdf",
			},
			{
				fetchImpl: fetchMock,
				baseUrl: "https://example.com",
			}
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(result.sections).toEqual(responsePayload.sections);
	});
});

describe("normalizeIngestEndpoint", () => {
	it("returns absolute URLs unchanged", () => {
		expect(
			normalizeIngestEndpoint("https://example.com/api/ingest")
		).toEqual("https://example.com/api/ingest");
	});

	it("resolves relative URLs with provided base", () => {
		expect(normalizeIngestEndpoint("/api/ingest", "https://host")).toEqual(
			"https://host/api/ingest"
		);
	});
});

describe("toPdfBlob", () => {
	it("handles Buffer inputs", () => {
		const buffer = Buffer.from("hello");
		const blob = toPdfBlob(buffer);

		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("application/pdf");
	});

	it("handles TypedArray inputs", () => {
		const view = new Uint8Array([1, 2, 3]);
		const blob = toPdfBlob(view);

		expect(blob.size).toBeGreaterThan(0);
	});
});
