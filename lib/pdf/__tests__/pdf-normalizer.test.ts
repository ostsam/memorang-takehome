import { describe, expect, it } from "vitest";

import { normalizePdfText } from "../pdf-normalizer";

describe("normalizePdfText", () => {
	it("splits text into sections using detected headings", () => {
		const text = `
BIOLOGY UNIT
LESSON PLAN 6th-8th grade

Topics
Introduction to Biology
DNA

Objectives
Students will be able to:
 Describe living systems
 Explain the importance of DNA
`;

		const sections = normalizePdfText(text);

		expect(sections).toEqual([
			{
				heading: "Biology Unit",
				body: "LESSON PLAN 6th-8th grade",
			},
			{
				heading: "Topics",
				body: "Introduction to Biology\nDNA",
			},
			{
				heading: "Objectives",
				body: "Students will be able to:\n- Describe living systems\n- Explain the importance of DNA",
			},
		]);
	});

	it("returns a default document section when no headings exist", () => {
		const text = "This is extracted PDF text content.";

		const sections = normalizePdfText(text);

		expect(sections).toEqual([
			{
				heading: "Document",
				body: "This is extracted PDF text content.",
			},
		]);
	});

	it("returns an empty array when text is blank or only markers", () => {
		const text = `
-- 1 of 2 --

-- 2 of 2 --
`;

		expect(normalizePdfText(text)).toEqual([]);
	});
});
