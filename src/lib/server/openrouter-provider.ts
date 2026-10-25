import { GenerationError } from "./errors";
import type { LessonProvider } from "./provider";

export function createOpenRouterProvider(options: { apiKey?: string; model?: string; fetch?: typeof fetch } = {}): LessonProvider {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey?.trim()) throw new GenerationError("PROVIDER_NOT_CONFIGURED", "Lesson creation is not connected yet. Configure the server-side OPENROUTER_API_KEY when ready.", 503);
  const model = options.model ?? process.env.SMRTR_OPENROUTER_MODEL ?? "openai/gpt-4.1";
  const fetcher = options.fetch ?? fetch;
  return {
    async generate(request) {
      let response: Response;
      try {
        response = await fetcher("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "SMRTR" },
          signal: request.signal,
          body: JSON.stringify({
            model,
            messages: [{ role: "system", content: request.instructions }, { role: "user", content: request.input }],
            max_tokens: request.maxOutputTokens,
            response_format: { type: "json_schema", json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema } },
            provider: { require_parameters: true },
          }),
        });
      } catch (error) {
        if (request.signal.aborted) throw error;
        throw new GenerationError("PROVIDER_UNREACHABLE", "We couldn’t reach lesson creation. Please try again.", 503);
      }
      // Upstream error bodies can include private notes or key fragments.
      if (!response.ok) {
        if ([401, 403].includes(response.status)) throw new GenerationError("PROVIDER_AUTH_FAILED", "The lesson connection needs attention. Please try again once it’s reconnected.", 503);
        if ([402, 429].includes(response.status)) throw new GenerationError("PROVIDER_RATE_LIMITED", "Lesson creation has reached its current limit. Please try again shortly.", 429);
        if ([400, 404, 422].includes(response.status)) throw new GenerationError("PROVIDER_CONFIGURATION_ERROR", "The lesson model is unavailable. Check the server’s OpenRouter model configuration.", 503);
        throw new GenerationError("PROVIDER_UNAVAILABLE", "Lesson creation is temporarily unavailable. Please try again.", 503);
      }
      const raw = await response.text();
      if (raw.length > 1_000_000) throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The lesson response was too large. Try a narrower topic.");
      let payload: unknown;
      try { payload = JSON.parse(raw); }
      catch { throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The lesson response was unreadable. Please try again."); }
      const envelope = payload as { error?: unknown; choices?: { finish_reason?: string; message?: { content?: unknown; refusal?: unknown } }[] } | null;
      if (!envelope || envelope.error || !Array.isArray(envelope.choices) || !envelope.choices[0]) throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The lesson response was incomplete. Please try again.");
      const choice = envelope.choices[0];
      if (choice.finish_reason === "length") throw new GenerationError("PROVIDER_INCOMPLETE", "The lesson exceeded the generation limit. Try a narrower topic or shorter notes.");
      if (choice.finish_reason === "content_filter" || choice.message?.refusal) throw new GenerationError("PROVIDER_REFUSED", "A lesson couldn’t be created from this input. Try different study material.", 422);
      if (choice.finish_reason !== "stop" || typeof choice.message?.content !== "string") throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The lesson response was incomplete. Please try again.");
      try { return JSON.parse(choice.message.content); }
      catch { throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The lesson response was invalid. Please try again."); }
    },
  };
}
