/**
 * Devolve uma string de tempo relativo em PT-PT.
 * Exemplos: "agora", "há 5 min", "há 2 h", "há 3 dias", "12 jun".
 */
export function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `há ${diffMin} min`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH} h`;

  const diffDays = Math.floor(diffH / 24);
  if (diffDays < 7) return `há ${diffDays} ${diffDays === 1 ? 'dia' : 'dias'}`;

  // Para > 7 dias mostra data curta
  return d.toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Timestamp completo, formato pt-PT, para tooltips.
 */
export function formatFullDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
