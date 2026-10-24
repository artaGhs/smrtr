import { GenerationError } from "./errors";

export type ProviderRequest = {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  instructions: string;
  input: string;
  signal: AbortSignal;
  maxOutputTokens: number;
};

export interface LessonProvider {
  generate(request: ProviderRequest): Promise<unknown>;
}

export function createOpenAIProvider(options: {
  apiKey?: string;
  model?: string;
  fetch?: typeof fetch;
} = {}): LessonProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    throw new GenerationError(
      "PROVIDER_NOT_CONFIGURED",
      "Generation needs a server-side OPENAI_API_KEY. Configure it in .env.local, then restart the server. You can still explore the labeled sample.",
      503,
    );
  }
  const model = options.model ?? process.env.SMRTR_MODEL ?? "gpt-4.1";
  const fetcher = options.fetch ?? fetch;
  return {
    async generate(request) {
      let response: Response;
      try {
        // Responses API structured outputs: https://developers.openai.com/api/docs/guides/structured-outputs
        response = await fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          signal: request.signal,
          body: JSON.stringify({
            model,
            store: false,
            instructions: request.instructions,
            input: request.input,
            max_output_tokens: request.maxOutputTokens,
            text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.jsonSchema } },
          }),
        });
      } catch (error) {
        if (request.signal.aborted) throw error;
        throw new GenerationError("PROVIDER_UNREACHABLE", "Could not reach the generation provider. Please try again.", 503);
      }
      // Never expose upstream bodies: they may contain submitted notes or credentials.
      if (!response.ok) {
        const status = response.status;
        if (status === 401 || status === 403) throw new GenerationError("PROVIDER_AUTH_FAILED", "The server's provider key was rejected. Check its access and restart the server.", 503);
        if (status === 429) throw new GenerationError("PROVIDER_RATE_LIMITED", "The generation provider is rate limited or out of quota. Try again shortly or check server billing.", 429);
        if (status === 404 || status === 400) throw new GenerationError("PROVIDER_CONFIGURATION_ERROR", "The provider rejected the model or request configuration. Check the server's SMRTR_MODEL setting.", 503);
        throw new GenerationError("PROVIDER_UNAVAILABLE", "The generation provider is temporarily unavailable. Please try again.", 503);
      }
      const raw = await response.text();
      if (raw.length > 1_000_000) throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The provider returned too much content. Try a narrower topic.");
      let payload: { status?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
      try { payload = JSON.parse(raw); }
      catch { throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The provider returned an unreadable response. Please try again."); }
      if (payload.status === "incomplete") throw new GenerationError("PROVIDER_INCOMPLETE", "The lesson exceeded the generation limit. Try a narrower topic or shorter notes.");
      const blocks = payload.output?.filter((item) => item.type === "message").flatMap((item) => item.content ?? []) ?? [];
      if (blocks.some((item) => item.type === "refusal")) throw new GenerationError("PROVIDER_REFUSED", "The provider could not create a lesson from this input. Try different study material.", 422);
      const output = blocks.filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
      try { return JSON.parse(output); }
      catch { throw new GenerationError("PROVIDER_INVALID_OUTPUT", "The provider returned invalid lesson JSON. Please try again."); }
    },
  };
}
