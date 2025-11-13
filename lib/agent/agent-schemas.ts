import { z } from "zod";

const choiceSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
});

const mcqSchema = z.object({
	id: z.string().regex(/^objective_[1-3]_q[1-3]$/),
	question: z.string().min(1),
	choices: z.array(choiceSchema).length(5),
	correct_choice_id: z.string().min(1),
	hint: z.string().min(1),
	explanation: z.string().min(1),
});

const objectiveSchema = z.object({
	id: z.string().regex(/^objective_[1-3]$/),
	title: z.string().min(1),
	description: z.string().min(1),
	study_guide: z.array(z.string().min(1)).min(2),
	reflection_prompt: z.string().min(1),
	mcqs: z.array(mcqSchema).length(3),
});

const finalAnalysisSchema = z.object({
	summary_template: z.string().min(1),
	strengths_template: z.array(z.string().min(1)).min(1),
	opportunities_template: z.array(z.string().min(1)).min(1),
	next_steps_template: z.array(z.string().min(1)).min(1),
});

export const lessonPlanSchema = z.object({
	lesson: z.object({
		title: z.string().min(1),
		source: z.string().min(1),
		introduction: z.string().min(1),
	}),
	objectives: z.array(objectiveSchema).length(3),
	final_analysis: finalAnalysisSchema,
});

export type LessonPlan = z.infer<typeof lessonPlanSchema>;

export const lessonPlanJsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["lesson", "objectives", "final_analysis"],
	properties: {
		lesson: {
			type: "object",
			additionalProperties: false,
			required: ["title", "source", "introduction"],
			properties: {
				title: { type: "string", minLength: 1 },
				source: { type: "string", minLength: 1 },
				introduction: { type: "string", minLength: 1 },
			},
		},
		objectives: {
			type: "array",
			minItems: 3,
			maxItems: 3,
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"id",
					"title",
					"description",
					"study_guide",
					"reflection_prompt",
					"mcqs",
				],
				properties: {
					id: { type: "string", pattern: "^objective_[1-3]$" },
					title: { type: "string", minLength: 1 },
					description: { type: "string", minLength: 1 },
					study_guide: {
						type: "array",
						minItems: 2,
						items: { type: "string", minLength: 1 },
					},
					reflection_prompt: { type: "string", minLength: 1 },
					mcqs: {
						type: "array",
						minItems: 3,
						maxItems: 3,
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
								id: { type: "string", pattern: "^objective_[1-3]_q[1-3]$" },
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
			},
		},
		final_analysis: {
			type: "object",
			additionalProperties: false,
			required: [
				"summary_template",
				"strengths_template",
				"opportunities_template",
				"next_steps_template",
			],
			properties: {
				summary_template: { type: "string", minLength: 1 },
				strengths_template: {
					type: "array",
					minItems: 1,
					items: { type: "string", minLength: 1 },
				},
				opportunities_template: {
					type: "array",
					minItems: 1,
					items: { type: "string", minLength: 1 },
				},
				next_steps_template: {
					type: "array",
					minItems: 1,
					items: { type: "string", minLength: 1 },
				},
			},
		},
	},
} as const;
