import { z } from "zod";

const choiceSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
});

const mcqSchema = z.object({
	id: z.string().min(1),
	question: z.string().min(1),
	choices: z.array(choiceSchema).length(5),
	correct_choice_id: z.string().min(1),
	hint: z.string().min(1),
	explanation: z.string().min(1),
});

export const lessonPlanSchema = z.object({
	lesson: z.object({
		title: z.string().min(1),
		source: z.string().min(1),
		description: z.string().min(1),
	}),
	questions: z.array(mcqSchema).length(10),
});

export type LessonPlan = z.infer<typeof lessonPlanSchema>;

export const lessonPlanJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["lesson", "questions"],
	properties: {
		lesson: {
			type: "object",
			additionalProperties: false,
			required: ["title", "source", "description"],
			properties: {
				title: { type: "string", minLength: 1 },
				source: { type: "string", minLength: 1 },
				description: { type: "string", minLength: 1 },
			},
		},
		questions: {
			type: "array",
			minItems: 10,
			maxItems: 10,
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"id",
					"question",
					"choices",
					"correct_choice_id",
					"hint",
					"explanation",
				],
				properties: {
					id: { type: "string", minLength: 1 },
					question: { type: "string", minLength: 1 },
					choices: {
						type: "array",
						minItems: 5,
						maxItems: 5,
						items: {
							type: "object",
							additionalProperties: false,
							required: ["id", "label"],
							properties: {
								id: { type: "string", minLength: 1 },
								label: { type: "string", minLength: 1 },
							},
						},
					},
					correct_choice_id: { type: "string", minLength: 1 },
					hint: { type: "string", minLength: 1 },
					explanation: { type: "string", minLength: 1 },
				},
			},
		},
	},
} as const;
