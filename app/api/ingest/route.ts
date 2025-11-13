import { Buffer } from "node:buffer";

import { NextRequest, NextResponse } from "next/server";

import { extractPdfText, type ParsedPdf } from "@/lib/pdf/pdf-parser";

export const runtime = "nodejs";

type IngestResponse = {
  text: string;
  metadata: ParsedPdf["metadata"];
  needsOcr: boolean;
  message?: string;
};

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

    const response: IngestResponse = {
      text: parsed.text,
      metadata: parsed.metadata,
      needsOcr: parsed.text.length === 0,
      message:
        parsed.text.length === 0
          ? "No embedded text detected. OCR fallback required."
          : undefined,
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
