import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

export function hasEmailWorkerSecret(): boolean {
  return /^[a-f0-9]{64}$/i.test(process.env.EMAIL_WORKER_SECRET ?? '');
}

export function verifyEmailWorkerAuth(request: Request): boolean {
  if (!hasEmailWorkerSecret()) return false;
  const header = request.headers.get('authorization') ?? '';
  if (header.length > 256 || !header.startsWith('Bearer ')) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(header.slice(7)), hash(process.env.EMAIL_WORKER_SECRET!));
}
