"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";
import { useEffect } from "react";
import { useDisplayMode, useMaxHeight, useRequestDisplayMode } from "./hooks";

export default function Home() {
	const maxHeight = useMaxHeight() ?? undefined;
	const displayMode = useDisplayMode();
	const requestDisplayMode = useRequestDisplayMode();

	// Load ChatKit web component script
	useEffect(() => {
		const script = document.createElement("script");
		script.src =
			"https://cdn.jsdelivr.net/npm/@openai/chatkit@latest/dist/chatkit.min.js";
		script.type = "module";
		document.head.appendChild(script);

		return () => {
			// Cleanup if needed
			if (script.parentNode) {
				script.parentNode.removeChild(script);
			}
		};
	}, []);

	const { control } = useChatKit({
		sessionUrl: "/api/chatkit/session",
		mcpServers: [
			{
				url: `${
					typeof window !== "undefined" ? window.location.origin : ""
				}/mcp`,
				name: "Memorang Quiz Generator",
				description: "Generate quizzes from uploaded PDF files",
			},
		],
		config: {
			fileUpload: {
				enabled: true,
				accept: "application/pdf",
				maxSize: 10 * 1024 * 1024, // 10MB
			},
		},
	} as any); // Type assertion due to incomplete type definitions

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
					className="fixed top-4 right-4 z-50 rounded-full bg-white p-2.5 text-slate-900 shadow-lg transition hover:bg-slate-100"
					onClick={() => requestDisplayMode("fullscreen")}
				>
					⛶
				</button>
			)}

			<main className="h-full w-full">
				<ChatKit control={control} style={{ height: "100%", width: "100%" }} />
			</main>
		</div>
	);
}
