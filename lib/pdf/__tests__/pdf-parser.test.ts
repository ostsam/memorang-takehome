import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractPdfText } from "../pdf-parser";

// Mock pdf-parse module - must be inside factory to avoid hoisting issues
vi.mock("pdf-parse", () => {
	const createMockParser = () => ({
		getText: vi.fn(),
		getInfo: vi.fn(),
		destroy: vi.fn(),
	});

	const mockParser = createMockParser();
	
	// Create a class-like constructor function that can be spied on
	const MockPDFParse = vi.fn(function (this: any) {
		return mockParser;
	}) as any;
	
	MockPDFParse.setWorker = vi.fn();

	return {
		PDFParse: MockPDFParse,
	};
});

describe("pdf-parser", () => {
	let mockParser: {
		getText: ReturnType<typeof vi.fn>;
		getInfo: ReturnType<typeof vi.fn>;
		destroy: ReturnType<typeof vi.fn>;
	};
	let MockPDFParse: ReturnType<typeof vi.fn> & { setWorker: ReturnType<typeof vi.fn> };

	beforeEach(async () => {
		// Get the mocked PDFParse constructor
		const pdfParseModule = await import("pdf-parse");
		MockPDFParse = pdfParseModule.PDFParse as any;
		// Reset the constructor mock
		MockPDFParse.mockClear();
		// Create a new instance (which returns the shared mockParser)
		mockParser = new MockPDFParse();
		// Reset parser method mocks
		mockParser.getText.mockReset();
		mockParser.getInfo.mockReset();
		mockParser.destroy.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("extractPdfText", () => {
		const mockBuffer = Buffer.from("mock-pdf-data");

		it("should successfully extract text and metadata from a PDF", async () => {
			// Arrange
			const mockText = "This is extracted PDF text content.";
			const mockMetadata = {
				Title: "Test Document",
				Author: "John Doe",
				Creator: "Adobe Acrobat",
				Producer: "PDF Producer",
				Subject: "Test Subject",
				Keywords: "test, pdf, parsing",
				CreationDate: new Date("2024-01-01"),
				ModDate: new Date("2024-01-02"),
			};

			mockParser.getText.mockResolvedValue({
				text: `  ${mockText}  `, // Test trimming
				total: 5,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 5,
				info: mockMetadata,
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result).toEqual({
				text: mockText,
				metadata: {
					title: "Test Document",
					author: "John Doe",
					creator: "Adobe Acrobat",
					producer: "PDF Producer",
					subject: "Test Subject",
					keywords: "test, pdf, parsing",
					creationDate: new Date("2024-01-01"),
					modificationDate: new Date("2024-01-02"),
					pageCount: 5,
				},
			});

			expect(MockPDFParse).toHaveBeenCalledWith({ data: mockBuffer });
			expect(mockParser.getText).toHaveBeenCalledOnce();
			expect(mockParser.getInfo).toHaveBeenCalledOnce();
			expect(mockParser.destroy).toHaveBeenCalledOnce();
		});

		it("should handle PDFs with minimal metadata", async () => {
			// Arrange
			mockParser.getText.mockResolvedValue({
				text: "Simple text content",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 1,
				info: null,
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.text).toBe("Simple text content");
			expect(result.metadata.pageCount).toBe(1);
			expect(result.metadata.title).toBeUndefined();
			expect(result.metadata.author).toBeUndefined();
		});

		it("should handle PDFs with partial metadata", async () => {
			// Arrange
			mockParser.getText.mockResolvedValue({
				text: "Content",
				total: 3,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 3,
				info: {
					Title: "Partial Doc",
					Author: "Author Name",
					// Other fields undefined
				},
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.metadata.title).toBe("Partial Doc");
			expect(result.metadata.author).toBe("Author Name");
			expect(result.metadata.creator).toBeUndefined();
			expect(result.metadata.pageCount).toBe(3);
		});

		it("should handle empty text PDFs (scanned documents)", async () => {
			// Arrange
			mockParser.getText.mockResolvedValue({
				text: "",
				total: 10,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 10,
				info: {
					Title: "Scanned Document",
				},
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.text).toBe("");
			expect(result.metadata.pageCount).toBe(10);
			expect(result.metadata.title).toBe("Scanned Document");
		});

		it("should handle whitespace-only text and trim it", async () => {
			// Arrange
			mockParser.getText.mockResolvedValue({
				text: "   \n\t  \n  ",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 1,
				info: null,
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.text).toBe("");
		});

		it("should gracefully handle parsing errors and return empty result", async () => {
			// Arrange
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			mockParser.getText.mockRejectedValue(new Error("PDF parsing failed"));

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result).toEqual({
				text: "",
				metadata: {
					pageCount: 0,
				},
			});

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[pdf-parser] Failed to extract PDF text:",
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});

		it("should handle errors during getInfo call", async () => {
			// Arrange
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			mockParser.getText.mockResolvedValue({
				text: "Some text",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockRejectedValue(
				new Error("Failed to get info")
			);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.text).toBe("");
			expect(result.metadata.pageCount).toBe(0);
			expect(consoleErrorSpy).toHaveBeenCalled();

			consoleErrorSpy.mockRestore();
		});

		it("should handle destroy errors gracefully", async () => {
			// Arrange
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			mockParser.getText.mockResolvedValue({
				text: "Content",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 1,
				info: null,
			});

			mockParser.destroy.mockRejectedValue(
				new Error("Destroy failed")
			);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.text).toBe("Content");
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[pdf-parser] Failed to cleanup parser:",
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});

		it("should handle Uint8Array input", async () => {
			// Arrange
			const uint8Array = new Uint8Array([1, 2, 3, 4, 5]);

			mockParser.getText.mockResolvedValue({
				text: "Content from Uint8Array",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 1,
				info: null,
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(uint8Array);

			// Assert
			expect(result.text).toBe("Content from Uint8Array");
			expect(MockPDFParse).toHaveBeenCalledWith({ data: uint8Array });
		});

		it("should handle null dates in metadata", async () => {
			// Arrange
			mockParser.getText.mockResolvedValue({
				text: "Content",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 1,
				info: {
					CreationDate: null,
					ModDate: null,
				},
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.metadata.creationDate).toBeNull();
			expect(result.metadata.modificationDate).toBeNull();
		});

		it("should handle dates as Date objects in metadata", async () => {
			// Arrange
			const creationDate = new Date("2024-01-15T10:30:00Z");
			const modDate = new Date("2024-01-16T14:45:00Z");

			mockParser.getText.mockResolvedValue({
				text: "Content",
				total: 1,
				pages: [],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 1,
				info: {
					CreationDate: creationDate,
					ModDate: modDate,
				},
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.metadata.creationDate).toEqual(creationDate);
			expect(result.metadata.modificationDate).toEqual(modDate);
		});

		it("should always call destroy even when getText fails", async () => {
			// Arrange
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			mockParser.getText.mockRejectedValue(new Error("Parse error"));
			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			await extractPdfText(mockBuffer);

			// Assert
			expect(mockParser.destroy).toHaveBeenCalledOnce();

			consoleErrorSpy.mockRestore();
		});

		it("should handle multi-page PDFs correctly", async () => {
			// Arrange
			mockParser.getText.mockResolvedValue({
				text: "Page 1 content\n\nPage 2 content\n\nPage 3 content",
				total: 3,
				pages: [
					{ num: 1, text: "Page 1 content" },
					{ num: 2, text: "Page 2 content" },
					{ num: 3, text: "Page 3 content" },
				],
			});

			mockParser.getInfo.mockResolvedValue({
				total: 3,
				info: {
					Title: "Multi-page Document",
				},
			});

			mockParser.destroy.mockResolvedValue(undefined);

			// Act
			const result = await extractPdfText(mockBuffer);

			// Assert
			expect(result.text).toContain("Page 1 content");
			expect(result.text).toContain("Page 2 content");
			expect(result.text).toContain("Page 3 content");
			expect(result.metadata.pageCount).toBe(3);
		});
	});
});
