import { Buffer } from "node:buffer";

import { baseURL } from "@/baseUrl";
import { runWorkflow } from "@/lib/agent";
import type { LessonPlan } from "@/lib/agent/agent-schemas";
import type { NormalizedSection } from "@/lib/agent/agent-ingest";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const getAppsSdkCompatibleHtml = async (baseUrl: string, path: string) => {
	const result = await fetch(`${baseUrl}${path}`);
	return await result.text();
};

type ContentWidget = {
	id: string;
	title: string;
	templateUri: string;
	invoking: string;
	invoked: string;
	html: string;
	description: string;
	widgetDomain: string;
};

const sectionSchema = z.object({
	heading: z.string().min(1),
	body: z.string().min(1),
});

const workflowInputShape = {
	input_as_text: z.string().optional(),
	pdf_sections: z.array(sectionSchema).optional() as z.ZodTypeAny,
	pdf_url: z.string().optional(),
	ingest_url: z.string().optional(),
	metadata: z.record(z.unknown()).optional() as z.ZodTypeAny,
} satisfies z.ZodRawShape;

const workflowInputSchema = z
	.object({
		...workflowInputShape,
		input_as_text: z
			.string()
			.min(1, { message: "Provide learner context or omit the field." })
			.optional(),
		pdf_sections: z.array(sectionSchema).min(1).optional(),
		pdf_url: z.string().min(1).optional(),
		ingest_url: z.string().min(1).optional(),
	})
	.superRefine((value, ctx) => {
		if (!value.pdf_sections?.length && !value.pdf_url) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Provide either `pdf_sections` or a `pdf_url` so the agent has content to teach from.",
				path: ["pdf_sections"],
			});
		}
	});

function widgetMeta(widget: ContentWidget) {
	return {
		"openai/outputTemplate": widget.templateUri,
		"openai/toolInvocation/invoking": widget.invoking,
		"openai/toolInvocation/invoked": widget.invoked,
		"openai/widgetAccessible": false,
		"openai/resultCanProduceWidget": true,
	} as const;
}

export const runtime = "nodejs";

const handler = createMcpHandler(async (server) => {
	const html = await getAppsSdkCompatibleHtml(baseURL, "/");

	const contentWidget: ContentWidget = {
		id: "lesson_plan_widget",
		title: "Guided Lesson Session",
		templateUri: "ui://widget/lesson-runner.html",
		invoking: "Generating lesson plan...",
		invoked: "Lesson ready",
		html: html,
		description:
			"Renders the structured lesson plan with objectives, MCQs, and progress tracking.",
		widgetDomain: baseURL,
	};
	server.registerResource(
		"lesson-plan-widget",
		contentWidget.templateUri,
		{
			title: contentWidget.title,
			description: contentWidget.description,
			mimeType: "text/html+skybridge",
			_meta: {
				"openai/widgetDescription": contentWidget.description,
				"openai/widgetPrefersBorder": true,
			},
		},
		async (uri) => ({
			contents: [
				{
					uri: uri.href,
					mimeType: "text/html+skybridge",
					text: `<html>${contentWidget.html}</html>`,
					_meta: {
						"openai/widgetDescription": contentWidget.description,
						"openai/widgetPrefersBorder": true,
						"openai/widgetDomain": contentWidget.widgetDomain,
					},
				},
			],
		})
	);

		server.registerTool<
			typeof workflowInputShape,
			Record<string, z.ZodTypeAny>
		>(
		contentWidget.id,
		{
			title: contentWidget.title,
			description:
				"Run the PDF-to-lesson workflow and render the interactive widget for learners.",
			inputSchema: workflowInputShape,
			_meta: widgetMeta(contentWidget),
		},
		async (rawInput) => {
			const input = workflowInputSchema.parse(rawInput);

			const pdfSource = await resolvePdfSource(
				input.pdf_sections,
				input.pdf_url
			);

			const workflowResult = await runWorkflow({
				input_as_text: input.input_as_text,
				metadata: input.metadata,
				ingestUrl: input.ingest_url,
				...pdfSource,
			});

			const lessonPlan = workflowResult.lesson_plan;
			const textSummary = makeSummaryText(lessonPlan, input.pdf_url);

			return {
				content: [
					{
						type: "text",
						text: textSummary,
					},
				],
				structuredContent: {
					lessonPlan,
					generatedAt: new Date().toISOString(),
					source: {
						pdfUrl: input.pdf_url,
						ingestUrl: input.ingest_url,
						sectionsProvided:
							typeof input.pdf_sections?.length === "number" &&
							input.pdf_sections.length > 0,
					},
				},
				_meta: widgetMeta(contentWidget),
			};
		}
	);
});

export const GET = handler;
export const POST = handler;

async function resolvePdfSource(
	sections?: NormalizedSection[],
	pdfUrl?: string
) {
	if (sections && sections.length > 0) {
		return { pdf_sections: sections };
	}

	if (!pdfUrl) {
		throw new Error(
			"No PDF content provided. Supply `pdf_sections` or `pdf_url`."
		);
	}

	const absoluteUrl = ensureAbsoluteUrl(pdfUrl);
	const pdfResponse = await fetch(absoluteUrl);

	if (!pdfResponse.ok) {
		throw new Error(`Failed to download PDF (${pdfResponse.status}).`);
	}

	const arrayBuffer = await pdfResponse.arrayBuffer();

	if (arrayBuffer.byteLength === 0) {
		throw new Error("Downloaded PDF was empty.");
	}

	return {
		pdfFile: Buffer.from(arrayBuffer),
		pdfFileName: extractFilename(absoluteUrl),
	};
}

function ensureAbsoluteUrl(target: string) {
	try {
		return new URL(target).toString();
	} catch {
		return new URL(target, baseURL).toString();
	}
}

function extractFilename(url: string) {
	try {
		const parsed = new URL(url);
		const segments = parsed.pathname.split("/").filter(Boolean);
		return segments[segments.length - 1] || "source.pdf";
	} catch {
		return "source.pdf";
	}
}

function makeSummaryText(lessonPlan: LessonPlan | undefined, pdfUrl?: string) {
	if (!lessonPlan) {
		return "Lesson plan generated. Open the widget to review objectives and questions.";
	}

	const parts = [
		`Lesson "${lessonPlan.lesson.title}" ready with ${lessonPlan.objectives.length} objectives.`,
	];

	if (pdfUrl) {
		parts.push(`Source PDF: ${pdfUrl}`);
	}

	return parts.join(" ");
}
