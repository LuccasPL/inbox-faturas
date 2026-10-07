export function base64ByteLength(content: unknown): number | null {
  if (typeof content !== 'string' || content.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
    return null;
  }
  const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}
