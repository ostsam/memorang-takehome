import OpenAI from "openai";
import type {
	Response as OpenAIResponse,
	ResponseOutputMessage,
	ResponseOutputText,
	ResponseStreamEvent,
	ResponseTextDeltaEvent,
} from "openai/resources/responses/responses";

import { resolvePdfContent, type NormalizedSection } from "./agent-ingest";
import { lessonPlanJsonSchema, lessonPlanSchema } from "./agent-schemas";

export type WorkflowInput = {
	input_as_text?: string;
	pdf_sections?: NormalizedSection[];
	metadata?: Record<string, unknown>;
	pdfFile?: Blob | File | ArrayBuffer | ArrayBufferView | Buffer;
	pdfFileName?: string;
	ingestUrl?: string;
	streaming?: {
		onEvent?: (event: ResponseStreamEvent) => void;
		onTextChunk?: (chunk: string) => void;
	};
};

const STREAMING_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `
You are an AI quiz designer with a strong pedagogical background who transforms provided PDF sections into exactly ten multiple-choice questions for a study widget.

Requirements:
- Output MUST follow the provided JSON schema exactly (lesson metadata + 10 MCQs, each with 5 answer choices).
- Every fact must trace back to the supplied pdf_sections, never fabricate unseen data.
- Keep tone concise and instructional.
- Hints should help the learner reason toward the correct answer without revealing it outright.
- Explanations must cite the relevant section or fact from the PDF and confirm the correct choice.
`;

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

export const runWorkflow = async (workflow: WorkflowInput) => {
	if (!process.env.OPENAI_API_KEY) {
		throw new Error("OPENAI_API_KEY is not set.");
	}

	const { sections, metadata } = await resolvePdfContent(workflow);

	const userPrompt =
		workflow.input_as_text?.trim() && workflow.input_as_text.trim().length > 0
			? workflow.input_as_text
			: "Generate 10 multiple-choice questions from the provided PDF content.";

	const pdfPayload = JSON.stringify(
		{
			pdf_sections: sections,
			metadata,
		},
		null,
		2
	);

	const stream = await openai.responses.stream({
		model: STREAMING_MODEL,
		input: [
			{
				role: "system",
				content: SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: `${userPrompt}\n\nPDF Data:\n${pdfPayload}`,
					},
				],
			},
		],
		text: {
			format: {
				type: "json_schema",
				name: "LessonPlan",
				strict: true,
				schema: lessonPlanJsonSchema,
			},
		},
	});

	const streamedChunks: string[] = [];

	for await (const event of stream) {
		workflow.streaming?.onEvent?.(event);

		if (isTextDeltaEvent(event)) {
			streamedChunks.push(event.delta);
			workflow.streaming?.onTextChunk?.(event.delta);
		}
	}

	const finalResponse = await stream.finalResponse();
	const lessonPlan = lessonPlanSchema.parse(
		extractStructuredJson(finalResponse)
	);

	return {
		output_text: JSON.stringify(lessonPlan, null, 2),
		lesson_plan: lessonPlan,
		streamed_text: streamedChunks.join(""),
		new_items: [],
		raw_response: finalResponse,
	};
};

const extractStructuredJson = (response: OpenAIResponse) => {
	for (const item of response.output ?? []) {
		if (isOutputMessage(item)) {
			for (const content of item.content ?? []) {
				if (isOutputText(content)) {
					try {
						return JSON.parse(content.text);
					} catch (error) {
						throw new Error(
							`Failed to parse structured JSON: ${(error as Error).message}`
						);
					}
				}
			}
		}
	}

	throw new Error("Model response did not include structured JSON content.");
};

const isTextDeltaEvent = (
	event: ResponseStreamEvent
): event is ResponseTextDeltaEvent =>
	event.type === "response.output_text.delta";

const isOutputMessage = (
	item: OpenAIResponse["output"][number]
): item is ResponseOutputMessage => item.type === "message";

const isOutputText = (
	content: ResponseOutputMessage["content"][number]
): content is ResponseOutputText => content.type === "output_text";
