import {
	Agent,
	type AgentInputItem,
	Runner,
	withTrace,
} from "@openai/agents";

type NormalizedSection = {
	heading: string;
	body: string;
};

type WorkflowInput = {
	input_as_text?: string;
	pdf_sections: NormalizedSection[];
	metadata?: Record<string, unknown>;
};

export const aiLearningAgent = new Agent({
	name: "AI Learning Agent",
	model: "gpt-4.1",
	instructions: `
You are an AI learning agent that turns uploaded PDFs into a structured 3-objective lesson.

Workflow:
1. You will receive normalized pdf_sections and metadata at the beginning of the conversation. Use ONLY this structured content—do not fabricate unseen facts.
2. From the provided sections, craft exactly 3 learning objectives. Each objective needs:
   • A concise description + context drawn from the PDF
   • A short study guide summary (format for a Study Guide widget)
   • A long-form reflection prompt for the learner
   • Three multiple-choice questions (radio inputs) with one correct answer apiece, plus hints/explanations
3. Guide the learner objective-by-objective:
   • Present the study guide, then collect the long-form response
   • Ask each MCQ sequentially; if incorrect, supply a hint and allow retries without penalty
   • Advance only when all 3 questions for the objective are answered correctly
4. Track progress across all 9 questions so you can report completion status
5. After the third objective is complete, generate a Final Analysis widget summarizing performance, strengths, gaps, and concrete next steps.

General rules:
- Always honor the 3 objectives × 3 MCQs contract
- Be encouraging but concise
- Reference the PDF metadata (title/author) when helpful
- Never guess at content you cannot trace back to the PDF
- Never guess at content you cannot trace back to the provided pdf_sections

Output format:
- Respond with a single JSON object and NOTHING else (no prose or Markdown fences).
- The JSON must match this shape:
{
  "lesson": {
    "title": "string",
    "source": "string (e.g., derived from metadata.title or author)",
    "introduction": "1–2 sentence overview of how the session will run"
  },
  "objectives": [
    {
      "id": "objective_1",
      "title": "string",
      "description": "string describing the goal + context",
      "study_guide": [
        "bullet or short paragraph strings highlighting key points for this objective"
      ],
      "reflection_prompt": "string",
      "mcqs": [
        {
          "id": "objective_1_q1",
          "question": "string",
          "choices": [
            {"id": "A","label": "string"},
            {"id": "B","label": "string"},
            {"id": "C","label": "string"},
            {"id": "D","label": "string"}
          ],
          "correct_choice_id": "A|B|C|D",
          "hint": "string shown after an incorrect answer",
          "explanation": "string shown after the correct answer"
        },
        "... exactly three MCQ objects per objective ..."
      ]
    }
  ],
  "final_analysis": {
    "summary_template": "string describing how to summarize performance once all objectives are complete",
    "strengths_template": [
      "string bullet describing how to note strengths"
    ],
    "opportunities_template": [
      "string bullet describing how to note gaps"
    ],
    "next_steps_template": [
      "string bullet describing actionable recommendations"
    ]
  }
}
- Ensure there are exactly 3 objectives, each with exactly 3 MCQs.
- Keep values concise but specific, and ensure the JSON is valid.
`,
	modelSettings: {
		temperature: 0.6,
		topP: 1,
		parallelToolCalls: false,
		maxTokens: 2048,
		store: true,
	},
});

export const runWorkflow = async (workflow: WorkflowInput) => {
	return withTrace("AI Learning Workflow", async () => {
		const conversationHistory: AgentInputItem[] = [];

		const userPrompt =
			workflow.input_as_text?.trim().length && workflow.input_as_text.trim().length > 0
				? workflow.input_as_text
				: "Create a structured lesson from the provided PDF content.";

		conversationHistory.push({
			role: "user",
			content: [
				{
					type: "input_text",
					text: `${userPrompt}\n\nPDF Data:\n${JSON.stringify(
						{
							pdf_sections: workflow.pdf_sections,
							metadata: workflow.metadata ?? {},
						},
						null,
						2
					)}`,
				},
			],
		});

		const runner = new Runner({
			traceMetadata: {
				__trace_source__: "agent-builder",
			},
		});

		const agentResult = await runner.run(aiLearningAgent, conversationHistory);

		if (!agentResult.finalOutput) {
			throw new Error("Agent did not return a final output.");
		}

		return {
			output_text: agentResult.finalOutput,
			new_items: agentResult.newItems.map((item) => item.rawItem),
		};
	});
};
