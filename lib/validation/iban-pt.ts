/**
 * Normaliza um IBAN: remove espaços e converte para maiúsculas.
 */
export function normalizeIban(input: string | null | undefined): string {
  if (!input) return '';
  return input.toUpperCase().replace(/\s+/g, '');
}

/**
 * Valida um IBAN via checksum mod 97.
 * Aceita IBANs já compactados ou com espaços.
 */
export function isValidIban(input: string | null | undefined): boolean {
  const iban = normalizeIban(input);
  if (iban.length < 15 || iban.length > 34) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;

  for (const char of rearranged) {
    const fragment =
      char >= 'A' && char <= 'Z' ? String(char.charCodeAt(0) - 55) : char;

    for (const digit of fragment) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

/**
 * Valida um IBAN português (PT50 + 21 dígitos + checksum).
 */
export function isValidIbanPt(input: string | null | undefined): boolean {
  const iban = normalizeIban(input);
  return /^PT50\d{21}$/.test(iban) && isValidIban(iban);
}
