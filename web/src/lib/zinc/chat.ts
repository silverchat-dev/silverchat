/**
 * The chat goes straight from this browser to OpenRouter with the short-lived key zkAPI issued: OpenRouter sees the
 * prompt, never who paid; zkAPI sees a proof that someone paid, never the prompt. Nothing passes through our server.
 */
export const OPENROUTER = "https://openrouter.ai/api/v1";

// a few to start with; any OpenRouter model id works
export const MODELS = ["~deepseek/deepseek-flash-latest", "google/gemini-3.8-flash", "openai/gpt-5.6-sol", "x-ai/grok-4.7", "anthropic/claude-sonnet-5.5"];

export type Message = { role: "user" | "assistant"; content: string };

/** Stream one answer, calling `onText` with the text so far. */
export async function ask(key: string, model: string, messages: Message[], onText: (t: string) => void, signal?: AbortSignal) {
  const res = await fetch(`${OPENROUTER}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`OpenRouter: ${(await res.json().catch(() => null))?.error?.message ?? res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = (rest + value).split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      const delta = JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content;
      if (delta) onText((text += delta));
    }
  }
  return text;
}

/** What an agent or a script needs to use the same key: OpenRouter speaks the OpenAI API. */
export const curl = (key: string, model: string) =>
  `curl ${OPENROUTER}/chat/completions \\\n  -H "Authorization: Bearer ${key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"hello"}]}'`;
