/**
 * Other AI providers: ChatGPT (OpenAI), Gemini (Google) and Grok (xAI), called
 * over their REST APIs with the user's own key. Claude keeps its own SDK path
 * in claude.ts; every AI feature goes through the provider chosen in Settings.
 */
import { CapacitorHttp } from "@capacitor/core";
import type * as z from "zod/v4";
import { toJSONSchema } from "zod/v4";
import { isNative } from "../lib/platform";
import { getSettings, updateSettings } from "../lib/settings";

export type Provider = "anthropic" | "openai" | "gemini" | "xai";

export interface ProviderInfo {
  id: Provider;
  label: string;
  short: string;
  defaultModel: string;
  keyHint: string;
  keyUrl: string;
  /** suggestions; "Load models" lists what the key can really use */
  models: { id: string; label: string }[];
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    short: "Claude",
    defaultModel: "claude-opus-5",
    keyHint: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5 – best quality (default)" },
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5 – faster, cheaper (good for bulk tagging)" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 – fastest, cheapest" }
    ]
  },
  openai: {
    id: "openai",
    label: "ChatGPT (OpenAI)",
    short: "ChatGPT",
    defaultModel: "gpt-5.5",
    keyHint: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [{ id: "gpt-5.5", label: "GPT-5.5" }]
  },
  gemini: {
    id: "gemini",
    label: "Gemini (Google)",
    short: "Gemini",
    defaultModel: "gemini-3.7-flash",
    keyHint: "AIza…",
    keyUrl: "https://aistudio.google.com/app/apikey",
    models: [{ id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" }]
  },
  xai: {
    id: "xai",
    label: "Grok (xAI)",
    short: "Grok",
    defaultModel: "grok-4.3",
    keyHint: "xai-…",
    keyUrl: "https://console.x.ai",
    models: [{ id: "grok-4.3", label: "Grok 4.3" }]
  }
};

const BASE: Record<"openai" | "xai", string> = { openai: "https://api.openai.com/v1", xai: "https://api.x.ai/v1" };
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

export function activeProvider(): Provider {
  return getSettings().provider ?? "anthropic";
}

export function providerKey(p: Provider = activeProvider()): string {
  const s = getSettings();
  return (p === "anthropic" ? s.apiKey : (s.keys?.[p] ?? "")).trim();
}

export function providerModel(p: Provider = activeProvider()): string {
  const s = getSettings();
  return (p === "anthropic" ? s.model : s.models?.[p]) || PROVIDERS[p].defaultModel;
}

export function setProviderKey(p: Provider, key: string): void {
  if (p === "anthropic") updateSettings({ apiKey: key });
  else updateSettings({ keys: { ...getSettings().keys, [p]: key } });
}

export function setProviderModel(p: Provider, model: string): void {
  if (p === "anthropic") updateSettings({ model });
  else updateSettings({ models: { ...getSettings().models, [p]: model } });
}

export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * fetch, falling back to the native HTTP stack on Android/iOS when the
 * provider doesn't allow calls from an app page (CORS). The fallback returns
 * the whole response at once (no streaming).
 */
async function aiFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if (!isNative || (e instanceof Error && e.name === "AbortError")) throw e;
    const r = await CapacitorHttp.request({
      url,
      method: init.method ?? "GET",
      headers: (init.headers ?? {}) as Record<string, string>,
      data: init.body ? JSON.parse(String(init.body)) : undefined,
      responseType: "text"
    });
    return new Response(typeof r.data === "string" ? r.data : JSON.stringify(r.data), { status: r.status });
  }
}

async function check(p: Provider, res: Response): Promise<Response> {
  if (res.ok) return res;
  let msg = res.statusText;
  try {
    const j = await res.clone().json();
    msg = j?.error?.message ?? j?.message ?? JSON.stringify(j).slice(0, 300);
  } catch {
    msg = (await res.text().catch(() => msg)).slice(0, 300) || msg;
  }
  throw new ProviderError(p, res.status, msg);
}

/** JSON Schema for the API: no "$schema"; Gemini doesn't take additionalProperties. */
function schemaFor(schema: z.ZodType, p: Provider): Record<string, unknown> {
  const js = toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  if (p === "gemini") {
    const strip = (o: unknown): void => {
      if (Array.isArray(o)) o.forEach(strip);
      else if (o && typeof o === "object") {
        delete (o as Record<string, unknown>).additionalProperties;
        Object.values(o).forEach(strip);
      }
    };
    strip(js);
  }
  return js;
}

function openAiHeaders(p: "openai" | "xai") {
  return { "content-type": "application/json", authorization: `Bearer ${providerKey(p)}` };
}

function geminiHeaders() {
  return { "content-type": "application/json", "x-goog-api-key": providerKey("gemini") };
}

/** One request that must answer with JSON matching `schema`. */
export async function jsonCall<T>(p: Exclude<Provider, "anthropic">, schema: z.ZodType<T>, system: string, user: string, signal?: AbortSignal): Promise<T> {
  const model = providerModel(p);
  let text: string;
  if (p === "gemini") {
    const res = await check(
      p,
      await aiFetch(`${GEMINI}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: geminiHeaders(),
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", responseJsonSchema: schemaFor(schema, p) }
        })
      })
    );
    const j = await res.json();
    const cand = j?.candidates?.[0];
    if (!cand?.content) throw new Error(`Gemini returned no answer${cand?.finishReason ? ` (${cand.finishReason})` : j?.promptFeedback?.blockReason ? ` (blocked: ${j.promptFeedback.blockReason})` : ""}.`);
    text = (cand.content.parts ?? []).map((x: { text?: string }) => x.text ?? "").join("");
  } else {
    const res = await check(
      p,
      await aiFetch(`${BASE[p]}/chat/completions`, {
        method: "POST",
        headers: openAiHeaders(p),
        signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ],
          response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema: schemaFor(schema, p) } }
        })
      })
    );
    const j = await res.json();
    const msg = j?.choices?.[0]?.message;
    if (msg?.refusal) throw new Error(`${PROVIDERS[p].short} declined this request: ${msg.refusal}`);
    text = msg?.content ?? "";
  }
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new Error(`Could not read ${PROVIDERS[p].short}'s answer as the expected JSON.`);
  }
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Reads a server-sent-events body (or a whole text when the native fallback was used). */
async function readSse(res: Response, onData: (json: unknown) => void): Promise<void> {
  const handle = (line: string) => {
    const t = line.trim();
    if (!t.startsWith("data:")) return;
    const data = t.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      onData(JSON.parse(data));
    } catch {
      /* keep-alive or partial line */
    }
  };
  if (!res.body) {
    (await res.text()).split("\n").forEach(handle);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    lines.forEach(handle);
  }
  if (buf) handle(buf);
}

/** Streaming chat (AI tutor, case examiner, hints). */
export async function chatStream(p: Exclude<Provider, "anthropic">, system: string, messages: ChatMessage[], onText: (d: string) => void, signal?: AbortSignal): Promise<string> {
  const model = providerModel(p);
  let out = "";
  const emit = (d: string | undefined) => {
    if (!d) return;
    out += d;
    onText(d);
  };
  if (p === "gemini") {
    const res = await check(
      p,
      await aiFetch(`${GEMINI}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: geminiHeaders(),
        signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
        })
      })
    );
    await readSse(res, (j) => {
      const parts = (j as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts ?? [];
      emit(parts.map((x) => x.text ?? "").join(""));
    });
  } else {
    const res = await check(
      p,
      await aiFetch(`${BASE[p]}/chat/completions`, {
        method: "POST",
        headers: openAiHeaders(p),
        signal,
        body: JSON.stringify({ model, stream: true, messages: [{ role: "system", content: system }, ...messages] })
      })
    );
    await readSse(res, (j) => emit((j as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content));
  }
  if (!out) throw new Error(`${PROVIDERS[p].short} returned an empty answer.`);
  return out;
}

/** Models this key can use (for the Settings list). */
export async function listModels(p: Provider): Promise<string[]> {
  const key = providerKey(p);
  if (!key) throw new Error(`Add your ${PROVIDERS[p].short} API key first.`);
  if (p === "anthropic") {
    const res = await check(
      p,
      await aiFetch("https://api.anthropic.com/v1/models?limit=100", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }
      })
    );
    return ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
  }
  if (p === "gemini") {
    const res = await check(p, await aiFetch(`${GEMINI}/models?pageSize=200`, { headers: geminiHeaders() }));
    return ((await res.json()).models ?? [])
      .filter((m: { supportedGenerationMethods?: string[] }) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m: { name: string }) => m.name.replace(/^models\//, ""))
      .filter((id: string) => /^gemini/.test(id) && !/(embedding|image|tts|audio|live|aqa)/.test(id));
  }
  const res = await check(p, await aiFetch(`${BASE[p]}/models`, { headers: openAiHeaders(p) }));
  return ((await res.json()).data ?? [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => (p === "xai" ? /^grok/.test(id) && !/(image|imagine|vision-beta|video)/.test(id) : /^(gpt|o\d|chatgpt)/.test(id) && !/(audio|realtime|tts|transcribe|image|search|embedding|instruct)/.test(id)))
    .sort()
    .reverse();
}
