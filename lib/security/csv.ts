export function csvCell(value: string | null | undefined): string {
  if (value == null) return '';
  const safe = /^[\t\r\n]|^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
