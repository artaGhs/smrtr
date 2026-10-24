export class GenerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

export function publicError(error: unknown): GenerationError {
  if (error instanceof GenerationError) return error;
  return new GenerationError("GENERATION_FAILED", "Lesson generation failed. Please try again.");
}
