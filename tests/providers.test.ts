import { afterEach, describe, expect, it, vi } from "vitest";
import { aiChat, aiFlashcards, aiTagBatch, describeAiError } from "../src/ai/claude";
import { listModels } from "../src/ai/providers";
import { updateSettings } from "../src/lib/settings";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sse = (events: unknown[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  updateSettings({ provider: "anthropic" });
});

describe("other AI providers", () => {
  it("ChatGPT: strict JSON-schema request, parsed answer", async () => {
    updateSettings({ provider: "openai", keys: { openai: "sk-test" }, models: { openai: "gpt-5.5" } });
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe("gpt-5.5");
      expect(body.messages[0].role).toBe("system");
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
      expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
      return json({ choices: [{ message: { content: JSON.stringify({ cards: [{ front: "Q", back: "A" }] }) } }] });
    });
    vi.stubGlobal("fetch", fetch);
    expect(await aiFlashcards("text")).toEqual([{ front: "Q", back: "A" }]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("Gemini: responseJsonSchema without additionalProperties, key in header", async () => {
    updateSettings({ provider: "gemini", keys: { gemini: "AIza-test" }, models: { gemini: "gemini-3.7-flash" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent");
        expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("AIza-test");
        const body = JSON.parse(String(init.body));
        expect(JSON.stringify(body.generationConfig.responseJsonSchema)).not.toContain("additionalProperties");
        expect(body.systemInstruction.parts[0].text).toContain("taxonomy");
        const items = [{ id: "q1", topic: "cerebrovascular", subtopic: "Aneurysms", tags: ["SAH"], keywords: ["sah"], difficulty: "easy", high_yield: true, summary: "s" }];
        return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [...items, { ...items[0], id: "zz" }] }) }] } }] });
      })
    );
    const tags = await aiTagBatch([{ id: "q1", text: "…" }]);
    expect(tags.map((t) => [t.id, t.topic])).toEqual([["q1", "Cerebrovascular"]]);
  });

  it("Grok: streams the tutor answer (OpenAI-compatible SSE)", async () => {
    updateSettings({ provider: "xai", keys: { xai: "xai-test" }, models: { xai: "grok-4.3" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe("https://api.x.ai/v1/chat/completions");
        const body = JSON.parse(String(init.body));
        expect(body.stream).toBe(true);
        expect(body.messages[1].content).toContain("<context>");
        return sse([{ choices: [{ delta: { content: "Hello " } }] }, { choices: [{ delta: { content: "resident" } }] }]);
      })
    );
    const parts: string[] = [];
    expect(await aiChat("ctx", [{ role: "user", content: "hi" }], (d) => parts.push(d))).toBe("Hello resident");
    expect(parts).toEqual(["Hello ", "resident"]);
  });

  it("explains errors per provider and lists models", async () => {
    updateSettings({ provider: "openai", keys: { openai: "bad" } });
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "Incorrect API key" } }, 401)));
    const err = await aiFlashcards("x").catch((e) => e);
    expect(describeAiError(err)).toBe("Invalid ChatGPT API key – check Settings.");

    updateSettings({ keys: { xai: "k" } });
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "grok-4.3" }, { id: "grok-imagine-image" }, { id: "grok-4.7" }] })));
    expect(await listModels("xai")).toEqual(["grok-4.7", "grok-4.3"]);
  });

  it("asks for the key of the chosen provider", async () => {
    updateSettings({ provider: "gemini", keys: {} });
    const err = await aiFlashcards("x").catch((e) => e);
    expect(describeAiError(err)).toBe("Add your Gemini API key in Settings to use AI features.");
  });
});
