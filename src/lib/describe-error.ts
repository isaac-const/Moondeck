/** Transforma o que o IPC rejeitou em texto legível, seja string ou objeto. */
export function describeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
