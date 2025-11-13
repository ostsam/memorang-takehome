## The Challenge

Memorang: Full-Stack AI: Mini Skills Test
Problem
Platforms like ChatGPT and Gemini are excellent for learning but lack a structured, persistent pedagogical flow.
Assignment
Your task is to build an AI learning agent that transforms uploaded source material into a structured lesson, guides users through learning objectives, tracks their progress, and delivers a final session report.
Desired Flow

1. User uploads a PDF on a topic (e.g., biology)
2. Agent generates a structured lesson object with learning objectives
3. Agent presents a rendered study guide in a widget
4. For each learning objective:
   1. Agent presents the learning objective and asks the user to write what they know in long form
   2. Agent presents three multiple-choice questions in a widget
   3. After each answer submission:
      1. If correct: Agent congratulates the user and shows an explanation
      2. If incorrect: Agent provides a hint and allows retry
   4. Once all three questions are answered correctly, move to next learning objective
5. After completing all three learning objectives (9 total questions), agent presents a structured analysis in a widget
6. Lesson concludes with summary and next steps
   Acceptance Criteria

- [ ] Agent successfully parses the uploaded PDF and extracts relevant content
- [ ] Lesson structure includes exactly 3 learning objectives with clear context
- [ ] Study guide widget renders properly with formatted content
- [ ] Long-form knowledge check appears before multiple-choice questions for each learning objective
- [ ] Multiple-choice questions display correctly in the widget with radio button selection
- [ ] Correct answers trigger a congratulatory message with an explanation
- [ ] Incorrect answers provide helpful hints and allow retries without penalty
- [ ] Progress tracking ensures all 3 questions per learning objective are answered correctly before advancing
- [ ] Final analysis widget displays a structured summary of performance across all 9 questions
- [ ] Session concludes with actionable next steps and learning recommendations
      Tools of the Trade
- 🔀 Required: Agent Builder + Widgets from OpenAI
- 🎁 Bonus: Deploy via ChatKit

## Project Plan

### Goal

Build an AI learning agent (powered by OpenAI Agent Builder + widgets) that ingests PDFs, generates a structured 3-objective lesson, guides users through knowledge checks, tracks progress, and delivers a final performance report. Front-end shell runs in Next.js and deploys via ChatKit.

### PR Breakdown

#### PR 1 – PDF Ingestion Service

[x] 1. Scaffold `/api/ingest` route in Next.js.
[x] 2. Handle file uploads (multipart) and run `pdf-parse` for text extraction.
[x] 3. Connect Google OCR as a fallback.
[x] 4. Normalize output into JSON sections/headings + metadata; return response that the agent can consume.
[x] 5. Unit-test parser with text-heavy and scanned sample PDFs.

#### PR 2 – Agent Builder Lesson Flow

[x] 1. Define lesson schema contract (3 objectives, overviews, knowledge prompts, 3 MCQs each, hints/explanations).
[x] 2. Create prompt/tool chain in Agent Builder that calls the ingestion API and produces the schema.
[x] 3. Add validation pass to ensure exactly 3 objectives × 3 questions.
[x] 4. Enable streaming responses and configure system instructions for tone + pedagogy.

#### PR 3 – Widgets & Progress Logic

1. Implement Study Guide widget to render lesson overview/objectives.
2. Build Objective Runner widget: long-form textarea → MCQ radio UI with hint/feedback.
3. Track per-question state (attempts, correctness) and block progression until all three are correct.
4. Implement Final Analysis widget summarizing performance across all 9 questions + recommendations.

#### PR 4 – Next.js Front-End Shell

1. Create upload UI that posts PDFs to the ingestion API and passes file references to the agent.
2. Integrate ChatKit widget configured with the Agent Builder deployment.
3. Add session chrome (progress indicator, status badges) around the widget.
4. Wire environment variables + deployment scripts (Vercel recommended).

#### PR 5 – Polish & QA

1. Add actionable session summary + next steps in agent responses.
2. Run end-to-end tests with multiple PDFs (text + scanned) to validate OCR and flow.
3. Document deployment steps, environment secrets, and ChatKit configuration.
