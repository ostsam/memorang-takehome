"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LessonPlan } from "@/lib/agent/agent-schemas";
import type { NormalizedSection } from "@/lib/pdf/pdf-normalizer";
import {
	useDisplayMode,
	useIsChatGptApp,
	useMaxHeight,
	useRequestDisplayMode,
} from "./hooks";

type Status = "idle" | "ingesting" | "calling-mcp" | "complete";

type IngestResponse = {
	metadata: {
		title?: string;
		author?: string;
		pageCount?: number;
		[key: string]: unknown;
	};
	sections: NormalizedSection[];
	message?: string;
};

type LessonRun = {
	summary?: string;
	lessonPlan?: LessonPlan;
	generatedAt?: string;
	source?: {
		pdfUrl?: string;
		ingestUrl?: string;
		sectionsProvided?: boolean;
	};
};

type LessonToolResponse = {
	content?: Array<{ type: string; text?: string }>;
	structuredContent?: LessonRun;
	[key: string]: unknown;
};

export default function Home() {
	const maxHeight = useMaxHeight() ?? undefined;
	const displayMode = useDisplayMode();
	const requestDisplayMode = useRequestDisplayMode();
	const isChatGptApp = useIsChatGptApp();

	const [file, setFile] = useState<File | null>(null);
	const [status, setStatus] = useState<Status>("idle");
	const [error, setError] = useState<string | null>(null);
	const [ingestResult, setIngestResult] = useState<IngestResponse | null>(null);
	const [lessonResult, setLessonResult] = useState<LessonRun | null>(null);
	const [rawToolResponse, setRawToolResponse] = useState<LessonToolResponse | null>(null);

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		setFile(event.target.files?.[0] ?? null);
		setStatus("idle");
		setError(null);
		setIngestResult(null);
		setLessonResult(null);
		setRawToolResponse(null);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!file) {
			setError("Choose a PDF first.");
			return;
		}

		setError(null);
		setStatus("ingesting");

		try {
			const ingest = await ingestPdf(file);
			setIngestResult(ingest);

			if (!ingest.sections.length) {
				throw new Error("No readable text was extracted. Try another PDF.");
			}

			setStatus("calling-mcp");
			const { summary, structured, raw } = await callLessonPlanTool({
				sections: ingest.sections,
				metadata: ingest.metadata,
			});

			setLessonResult({
				summary,
				lessonPlan: structured?.lessonPlan,
				generatedAt: structured?.generatedAt,
				source: structured?.source,
			});
			setRawToolResponse(raw);
			setStatus("complete");
		} catch (cause) {
			console.error(cause);
			setStatus("idle");
			setLessonResult(null);
			setRawToolResponse(null);
			setError(cause instanceof Error ? cause.message : "Something went wrong.");
		}
	};

	const handleReset = () => {
		setFile(null);
		setStatus("idle");
		setError(null);
		setIngestResult(null);
		setLessonResult(null);
		setRawToolResponse(null);
	};

	const disableForm = status === "ingesting" || status === "calling-mcp";
	const canReset = Boolean(
		file || ingestResult || lessonResult || rawToolResponse || error
	);

	return (
		<div
			className="min-h-screen bg-slate-950 text-white"
			style={{
				maxHeight,
				height: displayMode === "fullscreen" ? maxHeight : undefined,
			}}
		>
			{displayMode !== "fullscreen" && (
				<button
					aria-label="Enter fullscreen"
					className="fixed top-4 right-4 rounded-full bg-white p-2.5 text-slate-900 shadow-lg transition hover:bg-slate-100"
					onClick={() => requestDisplayMode("fullscreen")}
				>
					⛶
				</button>
			)}

			<main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
				{!isChatGptApp && (
					<div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-6 py-4 text-sm text-amber-50">
						<p className="font-semibold text-amber-200">
							window.openai not detected — running in standalone mode.
						</p>
						<p className="mt-1">
							That’s fine! We’ll call the MCP server directly and render the quiz
							here on the page.
						</p>
					</div>
				)}

				<header className="space-y-2">
					<p className="text-xs uppercase tracking-[0.3em] text-slate-500">
						PDF → Quiz
					</p>
					<h1 className="text-3xl font-semibold leading-tight">
						Upload a PDF, ingest it, and render the generated quiz right here.
					</h1>
					<p className="text-sm text-slate-300">
						We convert your document via <code>/api/ingest</code> and then call the
						<code>lesson_plan_widget</code> MCP tool over Streamable HTTP. No ChatGPT
						embedding required.
					</p>
				</header>

				<section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl shadow-black/30">
					<form className="space-y-4" onSubmit={handleSubmit}>
						<label className="block text-sm font-semibold text-slate-200">
							PDF file
							<input
								type="file"
								accept="application/pdf"
								onChange={handleFileChange}
								disabled={disableForm}
								className="mt-2 w-full cursor-pointer rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-100 file:mr-4 file:rounded-full file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-900"
							/>
						</label>
						{file && (
							<p className="text-xs text-slate-500">
								{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
							</p>
						)}
						<button
							type="submit"
							disabled={!file || disableForm}
							className="w-full rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700"
						>
							{status === "ingesting" && "Extracting PDF…"}
							{status === "calling-mcp" && "Running MCP workflow…"}
							{status === "complete" && "Run again"}
							{status === "idle" && "Generate quiz"}
						</button>
						<button
							type="button"
							onClick={handleReset}
							disabled={!canReset || disableForm}
							className="w-full rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:border-slate-900 disabled:text-slate-600"
						>
							Reset
						</button>
						<div className="text-sm text-slate-400">
							<p className="font-semibold text-slate-200">Status</p>
							<p className="mt-1">
								{
									{
										idle: "Waiting for a file selection.",
										ingesting: "Parsing PDF via /api/ingest…",
										"calling-mcp": "Calling the lesson plan tool…",
										complete: "Done! Scroll to review the quiz.",
									}[status]
								}
							</p>
						</div>
						{error && (
							<p className="rounded-2xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200">
								{error}
							</p>
						)}
					</form>
				</section>

				{ingestResult && (
					<section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
						<p className="text-xs uppercase tracking-[0.3em] text-slate-500">
							Ingest summary
						</p>
						<p className="mt-2 text-sm text-slate-200">
							Extracted {ingestResult.sections.length} sections from “
							{ingestResult.metadata.title || "Untitled document"}”.
						</p>
						{ingestResult.message && (
							<p className="mt-1 text-sm text-slate-400">
								{ingestResult.message}
							</p>
						)}
					</section>
				)}

				{lessonResult && lessonResult.lessonPlan && (
					<section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-inner shadow-black/30">
						<div className="flex flex-col gap-2">
							<p className="text-xs uppercase tracking-[0.3em] text-slate-500">
								Quiz preview
							</p>
							<h2 className="text-2xl font-semibold text-white">
								{lessonResult.lessonPlan.lesson.title}
							</h2>
							<p className="text-sm text-slate-300">
								{lessonResult.summary || "Lesson plan generated."}
							</p>
							<p className="text-xs text-slate-500">
								Generated at {lessonResult.generatedAt || "unknown time"}
							</p>
						</div>

						<div className="mt-6 space-y-6">
							<div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
								<p className="text-sm font-semibold text-slate-200">
									Lesson overview
								</p>
								<p className="mt-1 text-sm text-slate-400">
									{lessonResult.lessonPlan.lesson.description}
								</p>
								<p className="mt-1 text-xs text-slate-500">
									Source: {lessonResult.lessonPlan.lesson.source}
								</p>
							</div>

							<div>
								<p className="text-sm font-semibold text-slate-200">
									Sample questions
								</p>
								<div className="mt-3 grid gap-3 md:grid-cols-2">
									{lessonResult.lessonPlan.questions.slice(0, 4).map((q) => (
										<article
											key={q.id}
											className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-200"
										>
											<p className="font-semibold text-white">{q.question}</p>
											<ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
												{q.choices.map((choice) => (
													<li
														key={choice.id}
														className={
															choice.id === q.correct_choice_id ? "text-emerald-300" : undefined
														}
													>
														{choice.label}
													</li>
												))}
											</ul>
											<p className="mt-2 text-xs text-slate-500">Hint: {q.hint}</p>
											<p className="text-xs text-slate-500">
												Explanation: {q.explanation}
											</p>
										</article>
									))}
								</div>
							</div>
						</div>

						{rawToolResponse && (
							<details className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40">
								<summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-200">
									Inspect raw response
								</summary>
								<pre className="overflow-x-auto px-4 pb-4 text-xs text-slate-300">
{JSON.stringify(rawToolResponse, null, 2)}
								</pre>
							</details>
						)}
					</section>
				)}
			</main>
		</div>
	);
}

async function ingestPdf(file: File): Promise<IngestResponse> {
	const formData = new FormData();
	formData.append("file", file);

	const response = await fetch("/api/ingest", {
		method: "POST",
		body: formData,
	});

	let payload: unknown = null;

	try {
		payload = await response.json();
	} catch {
		// ignored, handled below
	}

	if (!response.ok) {
		const message =
			(payload as { error?: string } | null)?.error ??
			"Unable to ingest PDF. Please try again.";
		throw new Error(message);
	}

	if (!payload || typeof payload !== "object") {
		throw new Error("Received an invalid response from /api/ingest.");
	}

	return payload as IngestResponse;
}

async function callLessonPlanTool({
	sections,
	metadata,
}: {
	sections: NormalizedSection[];
	metadata: IngestResponse["metadata"];
}): Promise<{ summary: string; structured: LessonRun | undefined; raw: LessonToolResponse }> {
	const client = new McpClient({
		name: "Memorang Browser Demo",
		version: "1.0.0",
	});

	const transport = new StreamableHTTPClientTransport(
		new URL(`${window.location.origin}/mcp`)
	);

	await client.connect(transport);

	try {
		const raw = (await client.callTool({
			name: "lesson_plan_widget",
			arguments: {
				pdf_sections: sections,
				metadata,
			},
		})) as LessonToolResponse;

		const summary =
			raw.content?.find(
				(item): item is { type: "text"; text: string } =>
					item.type === "text" && typeof item.text === "string"
			)?.text ?? "Lesson plan generated.";

		return { summary, structured: raw.structuredContent, raw };
	} finally {
		await client.close();
	}
}
