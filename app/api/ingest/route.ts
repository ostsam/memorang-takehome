import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";

import { extractPdfText, type ParsedPdf } from "@/lib/pdf/pdf-parser";
import {
	normalizePdfText,
	type NormalizedSection,
} from "@/lib/pdf/pdf-normalizer";
import { runDocumentAiOcr } from "@/lib/pdf/document-ai-ocr";

export const runtime = "nodejs";

type IngestResponse = {
 metadata: ParsedPdf["metadata"];
 needsOcr: boolean;
  sections: NormalizedSection[];
  ocr?: {
    provider: "documentai";
    success: boolean;
    pageCount: number;
  };
  message?: string;
};

const MIN_EMBEDDED_TEXT_CHARACTERS = 25;

function requiresOcrFallback(text: string): boolean {
  const compact = text.replace(/\s+/g, "");
  if (compact.length === 0) {
    return true;
  }

  return compact.length < MIN_EMBEDDED_TEXT_CHARACTERS;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Expected a PDF file upload under the `file` field." },
        { status: 400 }
      );
    }

    const isPdf =
      file.type === "application/pdf" ||
      (typeof file.name === "string" && file.name.toLowerCase().endsWith(".pdf"));

    if (!isPdf) {
      return NextResponse.json(
        { error: "Only PDF uploads are supported." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await extractPdfText(buffer);

    let text = parsed.text;
    let needsOcr = requiresOcrFallback(text);
    let message: string | undefined =
      needsOcr ? "Embedded text insufficient. OCR fallback required." : undefined;
    let ocrSummary: IngestResponse["ocr"];

    if (needsOcr) {
      try {
        const ocrResult = await runDocumentAiOcr(buffer);
        ocrSummary = {
          provider: "documentai",
          success: ocrResult.text.length > 0,
          pageCount: ocrResult.pageCount,
        };

        if (ocrResult.text.length > 0) {
          text = ocrResult.text;
          needsOcr = false;
          message = "Text extracted via Document AI OCR.";
        } else {
          message = "Document AI OCR did not detect readable text.";
        }
      } catch (ocrError) {
        console.error("[ingest] Document AI OCR failed", ocrError);
        ocrSummary = {
          provider: "documentai",
          success: false,
          pageCount: 0,
        };
        message = "OCR fallback failed. Please try again later.";
      }
    }

    const response: IngestResponse = {
      metadata: parsed.metadata,
      needsOcr,
      sections: normalizePdfText(text),
      ocr: ocrSummary,
      message,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[ingest] Failed to parse PDF", error);

    return NextResponse.json(
      { error: "Unable to ingest PDF. Please try again." },
      { status: 500 }
    );
  }
}
