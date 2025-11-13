import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	runDocumentAiOcr,
	__resetDocumentAiConfigForTests,
} from "../document-ai-ocr";

const fetchMock = vi.fn();
const mockGetClient = vi.fn();
const mockGetAccessToken = vi.fn();

vi.mock("google-auth-library", () => {
	return {
		GoogleAuth: vi.fn().mockImplementation(function MockGoogleAuth() {
			return {
				getClient: mockGetClient,
			};
		}),
	};
});

describe("runDocumentAiOcr", () => {
	beforeEach(() => {
		process.env.GOOGLE_CLOUD_PROJECT_ID = "project-123";
		process.env.GOOGLE_CLOUD_LOCATION = "us";
		process.env.GOOGLE_CLOUD_PROCESSOR_ID = "processor-xyz";

		fetchMock.mockReset();
		mockGetClient.mockReset();
		mockGetAccessToken.mockReset();
		mockGetClient.mockResolvedValue({
			getAccessToken: mockGetAccessToken,
		});
		mockGetAccessToken.mockResolvedValue("fake-token");

		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		delete process.env.GOOGLE_CLOUD_PROJECT_ID;
		delete process.env.GOOGLE_CLOUD_LOCATION;
		delete process.env.GOOGLE_CLOUD_PROCESSOR_ID;
		__resetDocumentAiConfigForTests();
	});

	it("sends the PDF to Document AI and parses the response", async () => {
		const jsonMock = vi.fn().mockResolvedValue({
			document: {
				text: " Scanned text ",
				pages: [{}, {}],
			},
		});

		fetchMock.mockResolvedValue({
			ok: true,
			status: 200,
			json: jsonMock,
		} as any);

		const result = await runDocumentAiOcr(Buffer.from("pdf-data"));

		expect(fetchMock).toHaveBeenCalledWith(
			expect.stringContaining(
				"projects/project-123/locations/us/processors/processor-xyz:process"
			),
			expect.objectContaining({
				method: "POST",
			})
		);
		expect(result.text).toBe("Scanned text");
		expect(result.pageCount).toBe(2);
		expect(result.warnings).toEqual([]);
		expect(jsonMock).toHaveBeenCalledOnce();
	});

	it("throws when the API responds with an error", async () => {
		fetchMock.mockResolvedValue({
			ok: false,
			status: 403,
			text: vi.fn().mockResolvedValue("denied"),
		} as any);

		await expect(runDocumentAiOcr(Buffer.from("pdf"))).rejects.toThrow(
			/Document AI OCR failed/
		);
	});

	it("throws when required env vars are missing", async () => {
		delete process.env.GOOGLE_CLOUD_PROJECT_ID;

		await expect(runDocumentAiOcr(Buffer.from("pdf"))).rejects.toThrow(
			/GOOGLE_CLOUD_PROJECT_ID/
		);
	});
});
