import "dotenv/config";
import { runWorkflow } from "../agent";
import sampleLesson from "../samples/biology-lesson.json";

const main = async () => {
	const result = await runWorkflow({
		input_as_text:
			"Create a structured 3-objective middle school biology lesson using the provided packet.",
		pdf_sections: sampleLesson.sections.map((section) => ({
			heading: section.heading,
			body: section.body,
		})),
		metadata: sampleLesson.metadata,
	});

	console.log("\n=== Agent Output ===\n");
	console.log(result.output_text);

	if (result.new_items.length) {
		console.log("\n=== New Items ===\n");
		for (const item of result.new_items) {
			console.dir(item, { depth: null });
			console.log("---");
		}
	}
};

main().catch((error) => {
	console.error("Agent run failed:", error);
	process.exitCode = 1;
});
