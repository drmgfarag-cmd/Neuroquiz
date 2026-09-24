import { afterEach, describe, expect, it, vi } from "vitest";
import { aiTagBatch, AiNotConfiguredError } from "../src/ai/claude";
import { updateSettings } from "../src/lib/settings";

afterEach(() => vi.unstubAllGlobals());

describe("aiTagBatch", () => {
  it("requires an API key", async () => {
    updateSettings({ apiKey: "" });
    await expect(aiTagBatch([{ id: "q1", text: "x" }])).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("sends a structured-output request with refusal fallbacks and parses the reply", async () => {
    updateSettings({ apiKey: "sk-test", model: "claude-opus-5" });
    const calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
        const items = [
          { id: "q1", topic: "cerebrovascular", subtopic: "Aneurysms & SAH", tags: ["AComm"], keywords: ["sah"], difficulty: "easy", high_yield: true, summary: "AComm is commonest." },
          { id: "bogus", topic: "X", subtopic: "", tags: [], keywords: [], difficulty: "easy", high_yield: false, summary: "" }
        ];
        return new Response(
          JSON.stringify({
            id: "msg_1",
            type: "message",
            role: "assistant",
            model: "claude-opus-5",
            content: [{ type: "text", text: JSON.stringify({ items }) }],
            stop_reason: "end_turn",
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 10 }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );
    const out = await aiTagBatch([{ id: "q1", text: "Most common aneurysm site?" }]);
    expect(out).toHaveLength(1); // unknown ids dropped
    expect(out[0].topic).toBe("Cerebrovascular"); // normalised to taxonomy spelling
    const req = calls[0];
    expect(req.url).toMatch(/\/v1\/messages/);
    expect(req.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req.body.fallbacks).toBe("default");
    expect(req.body.model).toBe("claude-opus-5");
    const oc = req.body.output_config as { effort: string; format: { type: string } };
    expect(oc.effort).toBe("low");
    expect(oc.format.type).toBe("json_schema");
    expect((req.body.system as { cache_control?: unknown }[])[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("surfaces refusals", async () => {
    updateSettings({ apiKey: "sk-test", model: "claude-opus-5" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: "m", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: "refusal", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );
    await expect(aiTagBatch([{ id: "q1", text: "x" }])).rejects.toThrow(/declined/);
  });
});
