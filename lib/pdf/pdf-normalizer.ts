export interface NormalizedSection {
	heading: string;
	body: string;
}

const PAGE_MARKER_REGEX = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const NUMBERED_BULLET_REGEX = /^\d+[\.\)]\s+/;
const BULLET_PREFIX_REGEX =
	/^[\s]*[-*·‒–—−•●▪◦◉◍○‣▸▹▶►▻➤➔→■□◆◇\u2022\u2023\u2043\u2219\u25E6\u25AA\u25CF\u25CB\u25C6\u25C7\u25B8\u25B9\u25BA\u25BB\uf0b7]+[ \t]*/u;

/**
 * Converts raw PDF text into structured sections by detecting headings and grouping their content.
 */
export function normalizePdfText(text: string): NormalizedSection[] {
	const sanitized = sanitizeText(text);

	if (!sanitized) {
		return [];
	}

	const lines = sanitized.split("\n");
	const sections: NormalizedSection[] = [];

	let currentSection: { heading: string; lines: string[] } | null = null;
	let previousLineWasBlank = true;
	let encounteredMeaningfulLine = false;

	for (const rawLine of lines) {
		const trimmedLine = rawLine.trim();

		if (!trimmedLine) {
			if (currentSection && hasContent(currentSection.lines)) {
				currentSection.lines.push("");
			}
			previousLineWasBlank = true;
			continue;
		}

		if (PAGE_MARKER_REGEX.test(trimmedLine)) {
			previousLineWasBlank = true;
			continue;
		}

		encounteredMeaningfulLine = true;

		if (isHeadingCandidate(trimmedLine, previousLineWasBlank)) {
			if (currentSection && hasContent(currentSection.lines)) {
				sections.push({
					heading: currentSection.heading,
					body: collapseLines(currentSection.lines),
				});
			}

			currentSection = {
				heading: normalizeHeading(trimmedLine),
				lines: [],
			};

			previousLineWasBlank = false;
			continue;
		}

		const normalizedLine = normalizeBulletLine(trimmedLine);

		if (!normalizedLine) {
			previousLineWasBlank = true;
			continue;
		}

		if (!currentSection) {
			currentSection = {
				heading: "Document",
				lines: [],
			};
		}

		currentSection.lines.push(normalizedLine);
		previousLineWasBlank = false;
	}

	if (currentSection && hasContent(currentSection.lines)) {
		sections.push({
			heading: currentSection.heading,
			body: collapseLines(currentSection.lines),
		});
	}

	if (sections.length === 0 && encounteredMeaningfulLine) {
		return [
			{
				heading: currentSection?.heading ?? "Document",
				body: collapseLines(
					currentSection?.lines && currentSection.lines.length > 0
						? currentSection.lines
						: [sanitized]
				),
			},
		];
	}

	return sections;
}

function sanitizeText(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/\u00a0/g, " ")
		.replace(/\t/g, " ")
		.replace(/[ \t]+\n/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function hasContent(lines: string[]): boolean {
	return lines.some((line) => line.trim().length > 0);
}

function collapseLines(lines: string[]): string {
	return lines
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]+$/gm, "")
		.trim();
}

function normalizeBulletLine(line: string): string {
	if (BULLET_PREFIX_REGEX.test(line)) {
		const stripped = line.replace(BULLET_PREFIX_REGEX, "").trim();
		return stripped ? `- ${stripped}` : "";
	}

	if (NUMBERED_BULLET_REGEX.test(line)) {
		return `- ${line.replace(NUMBERED_BULLET_REGEX, "").trim()}`;
	}

	return line.trim();
}

function isHeadingCandidate(line: string, previousLineWasBlank: boolean): boolean {
	if (!previousLineWasBlank) {
		return false;
	}

	if (line.length > 80) {
		return false;
	}

	if (NUMBERED_BULLET_REGEX.test(line) || BULLET_PREFIX_REGEX.test(line)) {
		return false;
	}

	const lettersOnly = line.replace(/[^A-Za-z]/g, "");

	if (!lettersOnly) {
		return false;
	}

	const uppercaseLetters = lettersOnly.replace(/[^A-Z]/g, "").length;
	const uppercaseRatio = uppercaseLetters / lettersOnly.length;

	const words = line.split(/\s+/).filter(Boolean);
	const capitalizedWordCount = words.filter((word) =>
		/^[A-Z0-9]/.test(word)
	).length;
	const singleWordTitle =
		words.length === 1 && /^[A-Z][A-Za-z0-9\-()/:%]*$/.test(line);
	const multiWordTitle =
		words.length > 1 &&
		/^[A-Za-z0-9\s,'&\-()/:%]+$/.test(line) &&
		capitalizedWordCount >= Math.max(2, Math.ceil(words.length * 0.6));
	const endsWithColon = line.endsWith(":");
	const endsWithSentencePunctuation = /[.?!]$/.test(line);

	if (endsWithSentencePunctuation) {
		return uppercaseRatio >= 0.9; // Only treat as heading if almost all caps
	}

	return (
		uppercaseRatio >= 0.6 ||
		singleWordTitle ||
		multiWordTitle ||
		endsWithColon
	);
}

function normalizeHeading(line: string): string {
	const trimmed = line.trim().replace(/\s+/g, " ");

	if (/^[A-Z0-9\s,'&\-()/:%]+$/.test(trimmed) && trimmed === trimmed.toUpperCase()) {
		return trimmed
			.toLowerCase()
			.split(" ")
			.map((word) => {
				if (word.length <= 3 || word === word.toUpperCase()) {
					return word.toUpperCase();
				}

				return word.charAt(0).toUpperCase() + word.slice(1);
			})
			.join(" ");
	}

	return trimmed;
}
