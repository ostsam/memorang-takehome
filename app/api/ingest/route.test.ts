import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import { extractPdfText } from "@/lib/pdf/pdf-parser";
import { runDocumentAiOcr } from "@/lib/pdf/document-ai-ocr";

vi.mock("@/lib/pdf/pdf-parser", () => ({
	extractPdfText: vi.fn(),
}));

vi.mock("@/lib/pdf/document-ai-ocr", () => ({
	runDocumentAiOcr: vi.fn(),
}));

describe("POST /api/ingest", () => {
	const mockExtractPdfText = vi.mocked(extractPdfText);
	const mockRunDocumentAiOcr = vi.mocked(runDocumentAiOcr);

	beforeEach(() => {
		vi.clearAllMocks();
		mockRunDocumentAiOcr.mockResolvedValue({
			text: "",
			pageCount: 0,
			warnings: [],
		});
	});

	describe("successful PDF ingestion", () => {
		it("should successfully ingest a PDF with extractable text", async () => {
			// Arrange
			const mockText = "This is extracted PDF text content.";
			const mockMetadata = {
				title: "Test Document",
				author: "John Doe",
				pageCount: 5,
			};

			mockExtractPdfText.mockResolvedValue({
				text: mockText,
				metadata: mockMetadata,
			});

			const formData = new FormData();
			const pdfFile = new File(["mock pdf content"], "test.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data).toMatchObject({
				metadata: mockMetadata,
				needsOcr: false,
			});
			expect(data.sections).toEqual([
				{
					heading: "Document",
					body: mockText,
				},
			]);
			expect(data.message).toBeUndefined();
			expect(mockExtractPdfText).toHaveBeenCalledOnce();
		});

		it("should fallback to Document AI when embedded text missing and OCR succeeds", async () => {
			// Arrange
			mockExtractPdfText.mockResolvedValue({
				text: "",
				metadata: {
					pageCount: 10,
				},
			});

			const formData = new FormData();
			const pdfFile = new File(["scanned pdf"], "scanned.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			mockRunDocumentAiOcr.mockResolvedValue({
				text: "OCR text",
				pageCount: 3,
				warnings: [],
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data.needsOcr).toBe(false);
			expect(data.message).toBe("Text extracted via Document AI OCR.");
			expect(data.sections).toEqual([
				{ heading: "Document", body: "OCR text" },
			]);
			expect(data.ocr).toEqual({
				provider: "documentai",
				success: true,
				pageCount: 3,
			});
			expect(mockRunDocumentAiOcr).toHaveBeenCalled();
		});

		it("should keep needsOcr true when Document AI returns empty text", async () => {
			mockExtractPdfText.mockResolvedValue({
				text: "",
				metadata: { pageCount: 5 },
			});

			mockRunDocumentAiOcr.mockResolvedValue({
				text: "",
				pageCount: 5,
				warnings: [],
			});

			const formData = new FormData();
			const pdfFile = new File(["scanned pdf"], "scanned.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.needsOcr).toBe(true);
			expect(data.message).toBe("Document AI OCR did not detect readable text.");
			expect(data.ocr).toEqual({
				provider: "documentai",
				success: false,
				pageCount: 5,
			});
			expect(data.sections).toEqual([]);
		});

		it("should treat minimal embedded text as insufficient and trigger OCR", async () => {
			mockExtractPdfText.mockResolvedValue({
				text: "-- 1 of 1 --",
				metadata: { pageCount: 1 },
			});

			mockRunDocumentAiOcr.mockResolvedValue({
				text: "Recovered text",
				pageCount: 1,
				warnings: [],
			});

			const formData = new FormData();
			const pdfFile = new File(["scan"], "scan.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.needsOcr).toBe(false);
			expect(data.sections).toEqual([{ heading: "Document", body: "Recovered text" }]);
			expect(mockRunDocumentAiOcr).toHaveBeenCalledOnce();
		});

		it("should handle PDFs with full metadata", async () => {
			// Arrange
			const fullMetadata = {
				title: "Complete Document",
				author: "Jane Smith",
				creator: "Adobe Acrobat",
				producer: "PDF Producer",
				subject: "Test Subject",
				keywords: "test, keywords",
				creationDate: new Date("2024-01-01"),
				modificationDate: new Date("2024-01-02"),
				pageCount: 3,
			};

			mockExtractPdfText.mockResolvedValue({
				text: "This PDF already contains meaningful embedded text content.",
				metadata: fullMetadata,
			});

			const formData = new FormData();
			const pdfFile = new File(["content"], "doc.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			// Dates are serialized as strings in JSON, so compare as strings
			expect(data.metadata.title).toBe(fullMetadata.title);
			expect(data.metadata.author).toBe(fullMetadata.author);
			expect(data.metadata.creator).toBe(fullMetadata.creator);
			expect(data.metadata.producer).toBe(fullMetadata.producer);
			expect(data.metadata.subject).toBe(fullMetadata.subject);
			expect(data.metadata.keywords).toBe(fullMetadata.keywords);
			expect(data.metadata.pageCount).toBe(fullMetadata.pageCount);
			expect(data.metadata.creationDate).toBe(
				fullMetadata.creationDate.toISOString()
			);
			expect(data.metadata.modificationDate).toBe(
				fullMetadata.modificationDate.toISOString()
			);
			expect(data.needsOcr).toBe(false);
		});
	});

	describe("validation errors", () => {
		it("should return 400 when no file is provided", async () => {
			// Arrange
			const formData = new FormData();
			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(400);
			expect(data.error).toBe(
				"Expected a PDF file upload under the `file` field."
			);
			expect(mockExtractPdfText).not.toHaveBeenCalled();
		});

		it("should return 400 when file field is null", async () => {
			// Arrange
			const formData = new FormData();
			formData.append("file", ""); // Empty string
			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(400);
			expect(data.error).toBe(
				"Expected a PDF file upload under the `file` field."
			);
		});

		it("should return 400 when file is not a PDF (wrong MIME type)", async () => {
			// Arrange
			const formData = new FormData();
			const textFile = new File(["not a pdf"], "document.txt", {
				type: "text/plain",
			});
			formData.append("file", textFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(400);
			expect(data.error).toBe("Only PDF uploads are supported.");
			expect(mockExtractPdfText).not.toHaveBeenCalled();
		});

		it("should return 400 when file extension is not .pdf", async () => {
			// Arrange
			const formData = new FormData();
			const imageFile = new File(["fake pdf"], "image.jpg", {
				type: "image/jpeg",
			});
			formData.append("file", imageFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(400);
			expect(data.error).toBe("Only PDF uploads are supported.");
		});

		it("should accept PDFs with correct MIME type", async () => {
			// Arrange
			mockExtractPdfText.mockResolvedValue({
				text: "This PDF already includes actual embedded text content.",
				metadata: { pageCount: 1 },
			});

			const formData = new FormData();
			const pdfFile = new File(["pdf content"], "document.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);

			// Assert
			expect(response.status).toBe(200);
		});

		it("should accept files with .pdf extension even if MIME type is missing", async () => {
			// Arrange
			mockExtractPdfText.mockResolvedValue({
				text: "This PDF already includes actual embedded text content.",
				metadata: { pageCount: 1 },
			});

			const formData = new FormData();
			const pdfFile = new File(["pdf content"], "document.pdf", {
				type: "",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);

			// Assert
			expect(response.status).toBe(200);
			expect(mockExtractPdfText).toHaveBeenCalledOnce();
		});
	});

	describe("error handling", () => {
		it("should return 500 when PDF parsing fails", async () => {
			// Arrange
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			mockExtractPdfText.mockRejectedValue(
				new Error("PDF parsing failed")
			);

			const formData = new FormData();
			const pdfFile = new File(["corrupt pdf"], "corrupt.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(500);
			expect(data.error).toBe("Unable to ingest PDF. Please try again.");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[ingest] Failed to parse PDF",
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});

		it("should handle buffer conversion errors gracefully", async () => {
			// Arrange
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			// Create a file that might cause issues
			const formData = new FormData();
			const pdfFile = new File(["content"], "test.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			// Mock arrayBuffer to throw an error
			vi.spyOn(pdfFile, "arrayBuffer").mockRejectedValue(
				new Error("Buffer conversion failed")
			);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(500);
			expect(data.error).toBe("Unable to ingest PDF. Please try again.");
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it("should handle Document AI OCR failures gracefully", async () => {
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			mockExtractPdfText.mockResolvedValue({
				text: "",
				metadata: { pageCount: 2 },
			});

			mockRunDocumentAiOcr.mockRejectedValue(new Error("OCR error"));

			const formData = new FormData();
			const pdfFile = new File(["ocr"], "ocr.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			const response = await POST(request);
			const data = await response.json();

			expect(response.status).toBe(200);
			expect(data.needsOcr).toBe(true);
			expect(data.message).toBe("OCR fallback failed. Please try again later.");
			expect(data.ocr).toEqual({
				provider: "documentai",
				success: false,
				pageCount: 0,
			});
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[ingest] Document AI OCR failed",
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});
	});

	describe("edge cases", () => {
		it("should handle PDFs with whitespace-only text", async () => {
			// Arrange
			// The parser trims whitespace, so whitespace-only text becomes empty string
			mockExtractPdfText.mockResolvedValue({
				text: "", // Already trimmed by parser
				metadata: { pageCount: 1 },
			});

			const formData = new FormData();
			const pdfFile = new File(["content"], "test.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			// Empty text should trigger OCR
			expect(data.needsOcr).toBe(true);
			expect(data.sections).toEqual([]);
		});

		it("should handle very large PDFs", async () => {
			// Arrange
			const largeText = "A".repeat(1000000); // 1MB of text
			mockExtractPdfText.mockResolvedValue({
				text: largeText,
				metadata: { pageCount: 1000 },
			});

			const formData = new FormData();
			const pdfFile = new File(["large pdf"], "large.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data.sections).toEqual([
				{
					heading: "Document",
					body: expect.stringMatching(/^A+$/),
				},
			]);
			expect(data.sections[0].body.length).toBe(1000000);
			expect(data.needsOcr).toBe(false);
		});

		it("should preserve metadata even when text is empty", async () => {
			// Arrange
			const metadata = {
				title: "Scanned Document",
				author: "Author",
				pageCount: 5,
			};

			mockExtractPdfText.mockResolvedValue({
				text: "",
				metadata,
			});

			const formData = new FormData();
			const pdfFile = new File(["scanned"], "scanned.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(response.status).toBe(200);
			expect(data.metadata).toEqual(metadata);
			expect(data.needsOcr).toBe(true);
		});

		it("should handle PDFs with special characters in filename", async () => {
			// Arrange
			mockExtractPdfText.mockResolvedValue({
				text: "Content",
				metadata: { pageCount: 1 },
			});

			const formData = new FormData();
			const pdfFile = new File(["content"], "test (1).pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);

			// Assert
			expect(response.status).toBe(200);
		});
	});

	describe("response structure", () => {
		it("should return correct response structure for successful ingestion", async () => {
			// Arrange
			mockExtractPdfText.mockResolvedValue({
				text: "Sample text that is definitely long enough to count as embedded content.",
				metadata: {
					title: "Test",
					pageCount: 1,
				},
			});

			const formData = new FormData();
			const pdfFile = new File(["content"], "test.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(data).toHaveProperty("metadata");
			expect(data).toHaveProperty("needsOcr");
			expect(data).toHaveProperty("sections");
			expect(typeof data.needsOcr).toBe("boolean");
			expect(data.metadata).toHaveProperty("pageCount");
			expect(Array.isArray(data.sections)).toBe(true);
			expect(data).not.toHaveProperty("text");
		});

		it("should not include message field when OCR is not needed", async () => {
			// Arrange
			mockExtractPdfText.mockResolvedValue({
				text: "Has text that should be considered sufficient for embedded content.",
				metadata: { pageCount: 1 },
			});

			const formData = new FormData();
			const pdfFile = new File(["content"], "test.pdf", {
				type: "application/pdf",
			});
			formData.append("file", pdfFile);

			const request = new NextRequest("http://localhost/api/ingest", {
				method: "POST",
				body: formData,
			});

			// Act
			const response = await POST(request);
			const data = await response.json();

			// Assert
			expect(data.message).toBeUndefined();
		});
	});
});
