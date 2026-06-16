/**
 * Validação de NIF português (Contribuinte).
 *
 * Regras:
 * - 9 dígitos numéricos
 * - Primeiro dígito identifica o tipo de entidade (1-3, 5-9)
 * - Último dígito é o check digit (algoritmo mod 11)
 *
 * Referência: Decreto-Lei 463/79 + algoritmo público da AT.
 */

/** Primeiros dígitos válidos por tipo de entidade. */
const PRIMEIROS_DIGITOS_VALIDOS = new Set([1, 2, 3, 5, 6, 7, 8, 9]);

/**
 * Normaliza um NIF: remove espaços e prefixo PT, mantém só dígitos.
 */
export function normalizeNifPt(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toUpperCase()
    .replace(/^PT/, '')
    .replace(/\D/g, '');
}

/**
 * Verifica se um NIF português é válido (formato + checksum).
 * Aceita variações como "PT 504 789 123" ou "504789123".
 */
export function isValidNifPt(input: string | null | undefined): boolean {
  const nif = normalizeNifPt(input);
  if (nif.length !== 9) return false;

  const primeiro = parseInt(nif[0], 10);
  if (!PRIMEIROS_DIGITOS_VALIDOS.has(primeiro)) return false;

  // Cálculo do check digit
  let soma = 0;
  for (let i = 0; i < 8; i++) {
    soma += parseInt(nif[i], 10) * (9 - i);
  }
  const resto = soma % 11;
  const checkDigit = resto < 2 ? 0 : 11 - resto;

  return checkDigit === parseInt(nif[8], 10);
}
