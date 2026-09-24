/**
 * Claude integration. Runs directly from the app (browser / Android WebView /
 * desktop) with the user's own API key, which is stored only on this device.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import * as z from "zod/v4";
import { webPreview } from "../lib/platform";
import { getSettings } from "../lib/settings";
import { taxonomyText, TOPICS } from "./taxonomy";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Add your Anthropic API key in Settings to use AI features.");
  }
}

export function aiAvailable(): boolean {
  return !webPreview && !!getSettings().apiKey.trim();
}

/** Why AI features can't run right now (null when they can). */
export function aiUnavailableReason(): string | null {
  if (webPreview) return "AI features work in the Windows and Android apps; the web preview can't reach the AI service.";
  if (!getSettings().apiKey.trim()) return "Add your Anthropic API key in Settings to use AI features.";
  return null;
}

function client(): Anthropic {
  const { apiKey } = getSettings();
  if (!apiKey.trim()) throw new AiNotConfiguredError();
  return new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 3 });
}

/**
 * Server-side refusal fallbacks: if the primary model declines (e.g. a false
 * positive on medical content) the API re-runs the request on a fallback
 * model inside the same call.
 */
function fallbackParams(model: string) {
  const supported = /^claude-(opus-5|fable-5-1|opus-5-5)$/.test(model);
  return supported ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
}

function refusalMessage(stopReason: string | null | undefined): string | null {
  return stopReason === "refusal" ? "Claude declined this request. Try rephrasing or a different item." : null;
}

// ---------------------------------------------------------------------------
// Tagging
// ---------------------------------------------------------------------------

const TAG_SYSTEM = `You are an expert neurosurgeon and medical educator who indexes neurosurgery board-review questions so residents can search and revise by topic.

For each item assign:
- topic: exactly one topic from the taxonomy below (use the exact spelling).
- subtopic: the best matching subtopic listed under that topic. Only if none fits, write a short new subtopic name.
- tags: 3-8 short, specific concept tags a resident would search for (diseases, structures, procedures, classifications, eponyms, trials), e.g. "Spetzler-Martin grade", "vasospasm", "IDH mutation". Title case, no duplicates of topic/subtopic.
- keywords: 3-10 lower-case search terms including synonyms and abbreviations (e.g. "sah", "subarachnoid haemorrhage", "subarachnoid hemorrhage").
- difficulty: easy (recall of a core fact), medium (application), hard (multi-step reasoning or niche detail).
- high_yield: true when the concept is frequently examined in neurosurgery boards (ABNS/FRCS/EBNS).
- summary: one sentence (max 25 words) stating the key teaching point.

Judge from the question, the correct answer and the explanation together, i.e. tag the concept actually being tested, not just words that appear.

Taxonomy:
${taxonomyText()}`;

const TagItem = z.object({
  id: z.string(),
  topic: z.string(),
  subtopic: z.string(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  difficulty: z.enum(["easy", "medium", "hard"]),
  high_yield: z.boolean(),
  summary: z.string()
});
export type AiTag = z.infer<typeof TagItem>;
const TagResponse = z.object({ items: z.array(TagItem) });

export interface TagInput {
  id: string;
  text: string;
}

export async function aiTagBatch(items: TagInput[], signal?: AbortSignal): Promise<AiTag[]> {
  const { model } = getSettings();
  const body = items.map((it) => `<item id="${it.id}">\n${it.text.slice(0, 6000)}\n</item>`).join("\n\n");
  const res = await client().beta.messages.parse(
    {
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      // The taxonomy prompt is identical for every batch → cache it.
      system: [{ type: "text", text: TAG_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "low", format: betaZodOutputFormat(TagResponse) },
      messages: [{ role: "user", content: `Tag these ${items.length} items. Return one entry per item id.\n\n${body}` }]
    },
    { signal }
  );
  const refused = refusalMessage(res.stop_reason);
  if (refused) throw new Error(refused);
  if (!res.parsed_output) throw new Error(`Could not read Claude's tagging response (stop reason: ${res.stop_reason}).`);
  const valid = new Set(items.map((i) => i.id));
  return res.parsed_output.items
    .filter((t) => valid.has(t.id))
    .map((t) => ({ ...t, topic: TOPICS.find((x) => x.toLowerCase() === t.topic.toLowerCase()) ?? t.topic }));
}

// ---------------------------------------------------------------------------
// Smart search: turn a natural-language request into topics + search terms
// ---------------------------------------------------------------------------

const SearchPlan = z.object({
  topics: z.array(z.string()),
  subtopics: z.array(z.string()),
  terms: z.array(z.string()),
  explanation: z.string()
});
export type AiSearchPlan = z.infer<typeof SearchPlan>;

export async function aiSearchPlan(query: string, knownTags: string[]): Promise<AiSearchPlan> {
  const { model } = getSettings();
  const res = await client().beta.messages.parse({
    model,
    max_tokens: 4000,
    ...fallbackParams(model),
    system: `You help a neurosurgery resident find questions in their question bank. Convert the request into search filters.
- topics / subtopics: pick only from the taxonomy (exact spelling), may be empty.
- terms: 4-15 search terms: key concepts, synonyms, abbreviations, British and American spellings, related eponyms/classifications.
- explanation: one short sentence describing what you searched for.

Taxonomy:
${taxonomyText()}

Some tags already used in the bank: ${knownTags.slice(0, 300).join(", ")}`,
    output_config: { effort: "low", format: betaZodOutputFormat(SearchPlan) },
    messages: [{ role: "user", content: query }]
  });
  const refused = refusalMessage(res.stop_reason);
  if (refused) throw new Error(refused);
  if (!res.parsed_output) throw new Error("Could not interpret the search.");
  return res.parsed_output;
}

// ---------------------------------------------------------------------------
// Flashcards from a question
// ---------------------------------------------------------------------------

const CardsSchema = z.object({ cards: z.array(z.object({ front: z.string(), back: z.string() })) });

export async function aiFlashcards(questionText: string, count = 3): Promise<{ front: string; back: string }[]> {
  const { model } = getSettings();
  const res = await client().beta.messages.parse({
    model,
    max_tokens: 8000,
    ...fallbackParams(model),
    system:
      "You write high-yield neurosurgery flashcards (minimum-information principle: one fact per card, concise front as a question or cloze, back under 40 words). Use markdown for emphasis only.",
    output_config: { effort: "medium", format: betaZodOutputFormat(CardsSchema) },
    messages: [{ role: "user", content: `Write up to ${count} flashcards capturing what this question teaches:\n\n${questionText}` }]
  });
  const refused = refusalMessage(res.stop_reason);
  if (refused) throw new Error(refused);
  return res.parsed_output?.cards ?? [];
}

// ---------------------------------------------------------------------------
// Case scenario generation
// ---------------------------------------------------------------------------

const CaseSchema = z.object({
  title: z.string(),
  presentation: z.string(),
  stages: z.array(z.object({ title: z.string(), content: z.string(), question: z.string(), answer: z.string() })),
  discussion: z.string(),
  tags: z.array(z.string())
});
export type AiCase = z.infer<typeof CaseSchema>;

export async function aiGenerateCase(topic: string, context: string): Promise<AiCase> {
  const { model } = getSettings();
  const res = await client().beta.messages.stream({
    model,
    max_tokens: 32000,
    ...fallbackParams(model),
    system: `You are a consultant neurosurgeon writing an oral-board style clinical case for residents.
Structure: an initial presentation (history + examination, no diagnosis given), then 4-6 progressive stages (e.g. initial imaging, differential, management decision, operative considerations, complication, follow-up). Each stage adds new information (content), asks the examiner question (question) and gives a model answer (answer) with key facts, classifications and evidence.
Finish with a discussion of teaching points and relevant landmark evidence. Use markdown (lists, bold, tables) where helpful. Be clinically accurate and current.`,
    output_config: { effort: "high", format: betaZodOutputFormat(CaseSchema) },
    messages: [
      {
        role: "user",
        content: `Write a case on: ${topic}${context ? `\n\nBase it on the concepts tested in these question-bank items:\n${context.slice(0, 20000)}` : ""}`
      }
    ]
  });
  const msg = await res.finalMessage();
  const refused = refusalMessage(msg.stop_reason);
  if (refused) throw new Error(refused);
  if (!msg.parsed_output) throw new Error(`Case generation did not complete (stop reason: ${msg.stop_reason}).`);
  return msg.parsed_output;
}

// ---------------------------------------------------------------------------
// Streaming tutor chat (explain a question / discuss a case)
// ---------------------------------------------------------------------------

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export const TUTOR_SYSTEM = `You are an experienced neurosurgery consultant acting as a tutor and oral-board examiner for a neurosurgery resident.
- Be accurate, concise and clinically practical; cite classifications, guidelines and landmark trials by name where relevant.
- When discussing a case, behave like an examiner: probe reasoning, ask one follow-up question at a time, and correct misconceptions clearly.
- Use markdown (short paragraphs, lists, tables) for readability.
- If the source material in the context appears wrong or outdated, say so and explain why.`;

export async function aiChat(
  context: string,
  history: ChatTurn[],
  onText: (delta: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { model } = getSettings();
  const messages: BetaMessageParam[] = history.map((t, i) =>
    i === 0 && t.role === "user"
      ? { role: "user", content: [{ type: "text", text: `<context>\n${context}\n</context>` }, { type: "text", text: t.content }] }
      : { role: t.role, content: t.content }
  );
  const stream = client().beta.messages.stream(
    {
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      system: TUTOR_SYSTEM,
      output_config: { effort: "medium" },
      messages
    },
    { signal }
  );
  stream.on("text", (d) => onText(d));
  const msg = await stream.finalMessage();
  const refused = refusalMessage(msg.stop_reason);
  if (refused) throw new Error(refused);
  return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
}

export function describeAiError(e: unknown): string {
  if (e instanceof AiNotConfiguredError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "Invalid API key – check Settings.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This API key is not allowed to use the selected model.";
  if (e instanceof Anthropic.NotFoundError) return "Model not found – check the model name in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the API – wait a moment and retry.";
  if (e instanceof Anthropic.APIConnectionError) return "No connection to the Anthropic API (offline?).";
  if (e instanceof Anthropic.APIError) return `API error ${e.status ?? ""}: ${e.message}`;
  if (e instanceof Error && e.name === "AbortError") return "Cancelled.";
  return e instanceof Error ? e.message : String(e);
}

// ---------------------------------------------------------------------------
// Answer-key check
// ---------------------------------------------------------------------------

const CHECK_SYSTEM = `You are a neurosurgery board examiner auditing a question bank that was extracted from books by OCR. For each question decide whether the stated correct answer is right.

- verdict "agree": the stated answer is correct.
- verdict "disagree": the stated answer is wrong, or contradicts the explanation (e.g. the explanation argues for a different option), or the key points at the wrong option letter.
- verdict "unsure": the question is ambiguous, garbled by OCR, missing information (e.g. depends on an image you cannot see), or current evidence is genuinely divided.

suggested_keys: the option keys you consider correct (for single/multiple-answer questions), else an empty list.
suggestion: your correct answer in words (for true/false or matching questions list each item, e.g. "a TRUE, b FALSE").
reason: one or two sentences citing the decisive fact, guideline or classification. Mention OCR problems if you see them.
Judge by current evidence and standard neurosurgical references; do not flag a question just because the wording is awkward.`;

const CheckItem = z.object({
  id: z.string(),
  verdict: z.enum(["agree", "disagree", "unsure"]),
  suggested_keys: z.array(z.string()),
  suggestion: z.string(),
  reason: z.string()
});
export type AiCheck = z.infer<typeof CheckItem>;
const CheckResponse = z.object({ items: z.array(CheckItem) });

export async function aiCheckAnswers(items: TagInput[], signal?: AbortSignal): Promise<AiCheck[]> {
  const { model } = getSettings();
  const body = items.map((it) => `<question id="${it.id}">\n${it.text.slice(0, 8000)}\n</question>`).join("\n\n");
  const res = await client().beta.messages.parse(
    {
      model,
      max_tokens: 16000,
      ...fallbackParams(model),
      system: [{ type: "text", text: CHECK_SYSTEM, cache_control: { type: "ephemeral" } }],
      output_config: { effort: "medium", format: betaZodOutputFormat(CheckResponse) },
      messages: [{ role: "user", content: `Audit these ${items.length} questions. Return one entry per question id.\n\n${body}` }]
    },
    { signal }
  );
  const refused = refusalMessage(res.stop_reason);
  if (refused) throw new Error(refused);
  if (!res.parsed_output) throw new Error(`Could not read Claude's answer check (stop reason: ${res.stop_reason}).`);
  const valid = new Set(items.map((i) => i.id));
  return res.parsed_output.items.filter((c) => valid.has(c.id));
}
