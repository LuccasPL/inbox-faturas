/**
 * Normaliza um endereço de email para comparação e persistência.
 * Se vier no formato "Nome <email@dominio>", extrai só o endereço.
 */
export function normalizeEmailAddress(
  input: string | null | undefined,
): string {
  if (!input) return '';

  const trimmed = input.trim();
  const angleMatch = trimmed.match(/<([^<>]+)>/);
  const candidate = (angleMatch?.[1] ?? trimmed).trim();

  return candidate.toLowerCase();
}
