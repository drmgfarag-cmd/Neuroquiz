import { useState } from "react";
import { aiChat, describeAiError } from "../ai/claude";
import { activeProvider, listModels, PROVIDERS, providerKey, providerModel, setProviderKey, setProviderModel, type Provider } from "../ai/providers";
import { updateSettings, useSettings } from "../lib/settings";

const ORDER: Provider[] = ["anthropic", "openai", "gemini", "xai"];

/** Choose the AI provider (Claude, ChatGPT, Gemini, Grok), its key and model. */
export function AiSettings() {
  useSettings(); // re-render on changes
  const current = activeProvider();
  const [shown, setShown] = useState<Provider>(current);
  const [showKey, setShowKey] = useState(false);
  const [loaded, setLoaded] = useState<Partial<Record<Provider, string[]>>>({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const info = PROVIDERS[shown];
  const model = providerModel(shown);
  const options = Array.from(new Set([...info.models.map((m) => m.id), ...(loaded[shown] ?? []), model]));
  const label = (id: string) => info.models.find((m) => m.id === id)?.label ?? id;

  const load = async () => {
    setBusy(true);
    setMsg("Loading models…");
    try {
      const list = await listModels(shown);
      setLoaded({ ...loaded, [shown]: list });
      setMsg(list.length ? `${list.length} models available to this key.` : "No chat models found for this key.");
    } catch (e) {
      setMsg(describeAiError(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMsg("Testing…");
    const before = activeProvider();
    updateSettings({ provider: shown });
    try {
      const out = await aiChat("Connection test.", [{ role: "user", content: "Reply with the single word: ready" }], () => undefined);
      setMsg(`✓ ${info.short} (${model}) answered: “${out.trim().slice(0, 60)}”`);
    } catch (e) {
      setMsg(`✗ ${describeAiError(e)}`);
    } finally {
      updateSettings({ provider: before });
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <h2 className="card-title" style={{ margin: 0 }}>AI assistant</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Used for tagging, smart search, flashcard and case generation, hints, the answer check and the AI tutor. Pick the service you have a key for; keys stay on this device and are
        never synced.
      </p>
      <div className="provider-grid" role="radiogroup" aria-label="AI provider">
        {ORDER.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={shown === p}
            className={`provider-tile p-${p} ${shown === p ? "active" : ""}`}
            onClick={() => {
              setShown(p);
              setMsg("");
            }}
          >
            <span className="provider-dot" aria-hidden />
            <strong>{PROVIDERS[p].short}</strong>
            <span className="small muted">{PROVIDERS[p].label.replace(/^.*\((.*)\)$/, "$1")}</span>
            {current === p && <span className="chip good">in use</span>}
            {current !== p && providerKey(p) && <span className="chip">key saved</span>}
          </button>
        ))}
      </div>

      <label className="field">
        {info.label} API key
        <div className="row">
          <input
            type={showKey ? "text" : "password"}
            value={providerKey(shown)}
            onChange={(e) => setProviderKey(shown, e.target.value)}
            placeholder={info.keyHint}
            style={{ flex: 1, minWidth: 220 }}
            autoComplete="off"
          />
          <button className="small" onClick={() => setShowKey(!showKey)}>
            {showKey ? "Hide" : "Show"}
          </button>
        </div>
      </label>
      <p className="small muted" style={{ margin: 0 }}>
        Get a key at{" "}
        <a href={info.keyUrl} target="_blank" rel="noreferrer">
          {info.keyUrl.replace(/^https:\/\//, "")}
        </a>
        . Usage is billed by {info.label.replace(/^.*\((.*)\)$/, "$1")} to your account.
      </p>

      <div className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: "1 1 240px" }}>
          Model
          <select value={model} onChange={(e) => setProviderModel(shown, e.target.value)}>
            {options.map((id) => (
              <option key={id} value={id}>
                {label(id)}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ flex: "1 1 200px" }}>
          Or type a model ID
          <input type="text" value={model} onChange={(e) => setProviderModel(shown, e.target.value.trim() || info.defaultModel)} />
        </label>
      </div>
      <div className="row">
        <button className="small" disabled={busy || !providerKey(shown)} onClick={load}>
          Load models
        </button>
        <button className="small" disabled={busy || !providerKey(shown)} onClick={test}>
          Test
        </button>
        <button className="small primary" disabled={current === shown || !providerKey(shown)} onClick={() => updateSettings({ provider: shown })}>
          {current === shown ? `${info.short} is in use` : `Use ${info.short}`}
        </button>
        {msg && <span className="small">{msg}</span>}
      </div>
    </div>
  );
}
