import "dotenv/config";
import { runWorkflow } from "../lib/agent";
import sampleLesson from "../samples/biology-lesson.json";

const main = async () => {
	const streamed: string[] = [];

	const result = await runWorkflow({
		input_as_text:
			"Create a structured 3-objective middle school biology lesson using the provided packet.",
		pdf_sections: sampleLesson.sections.map((section) => ({
			heading: section.heading,
			body: section.body,
		})),
		metadata: sampleLesson.metadata,
		streaming: {
			onTextChunk: (chunk) => {
				if (!streamed.length) {
					console.log("=== Streaming JSON Chunks ===");
				}
				streamed.push(chunk);
				process.stdout.write(chunk);
			},
		},
	});

	if (streamed.length) {
		console.log("\n=== Streaming complete ===\n");
	}

	console.log("\n=== Lesson Plan (validated) ===\n");
	console.log(result.output_text);
};

main().catch((error) => {
	console.error("Agent run failed:", error);
	process.exitCode = 1;
});
