import { PDFParse } from "pdf-parse";
import type { LoadParameters } from "pdf-parse";
import { join } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";

// Configure worker for Node.js environment (Next.js requires explicit path)
let workerConfigured = false;

function ensureWorkerConfigured() {
	if (!workerConfigured) {
		try {
			// For Next.js with pnpm, we need to use the worker that matches pdf-parse's pdfjs-dist version
			// pdf-parse@2.4.5 depends on pdfjs-dist@5.4.296
			const workerPath = join(
				cwd(),
				"node_modules/.pnpm/pdfjs-dist@5.4.296/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
			);

			// Convert to file:// URL for Node.js dynamic import
			const workerUrl = pathToFileURL(workerPath).href;

			// Set worker with the file URL
			PDFParse.setWorker(workerUrl);

			workerConfigured = true;
		} catch (error) {
			console.error("[pdf-parser] Failed to configure worker:", error);
			throw new Error("Failed to configure PDF worker");
		}
	}
}

/**
 * Metadata extracted from a PDF document
 */
export interface PdfMetadata {
	title?: string;
	author?: string;
	creator?: string;
	producer?: string;
	subject?: string;
	keywords?: string;
	creationDate?: Date | null;
	modificationDate?: Date | null;
	pageCount: number;
}

/**
 * Result of parsing a PDF document
 */
export interface ParsedPdf {
	text: string;
	metadata: PdfMetadata;
}

/**
 * Extracts text and metadata from a PDF buffer
 *
 * @param buffer - PDF file as a Buffer or Uint8Array
 * @returns Parsed PDF with text content and metadata
 *
 * @example
 * ```typescript
 * const buffer = await fs.readFile('document.pdf');
 * const result = await extractPdfText(buffer);
 * console.log(result.text);
 * console.log(result.metadata.title);
 * ```
 */
export async function extractPdfText(
	buffer: Buffer | Uint8Array
): Promise<ParsedPdf> {
	let parser: PDFParse | null = null;

	try {
		// Ensure worker is configured before creating parser instance
		ensureWorkerConfigured();

		// Configure pdf-parse with the buffer data
		const loadParams: LoadParameters = {
			data: buffer,
		};

		parser = new PDFParse(loadParams);

		// Extract text content
		const textResult = await parser.getText();

		// Extract metadata and document info
		const infoResult = await parser.getInfo();

		// Build metadata object with basic fields
		const metadata: PdfMetadata = {
			title: infoResult.info?.Title,
			author: infoResult.info?.Author,
			creator: infoResult.info?.Creator,
			producer: infoResult.info?.Producer,
			subject: infoResult.info?.Subject,
			keywords: infoResult.info?.Keywords,
			creationDate: infoResult.info?.CreationDate,
			modificationDate: infoResult.info?.ModDate,
			pageCount: infoResult.total,
		};

		return {
			text: textResult.text.trim(),
			metadata,
		};
	} catch (error) {
		// Log the error for debugging but return empty result gracefully
		console.error("[pdf-parser] Failed to extract PDF text:", error);

		// Return empty text with minimal metadata
		return {
			text: "",
			metadata: {
				pageCount: 0,
			},
		};
	} finally {
		// Always clean up resources
		if (parser) {
			try {
				await parser.destroy();
			} catch (cleanupError) {
				console.error("[pdf-parser] Failed to cleanup parser:", cleanupError);
			}
		}
	}
}
