import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

/**
 * AES-256-GCM para encriptar segredos guardados em DB (ex: API key Moloni).
 *
 * Para gerar uma APP_ENC_KEY nova (32 bytes em hex), corre:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * E põe em .env.local como APP_ENC_KEY=<hex>
 *
 * Formato do ciphertext (base64url): <iv(12)>.<tag(16)>.<cipher>
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey(): Buffer {
  const hex = process.env.APP_ENC_KEY;
  if (!hex) {
    throw new Error('APP_ENC_KEY em falta no ambiente');
  }
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error('APP_ENC_KEY tem de ser 32 bytes (64 chars hex)');
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv) as CipherGCM;
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join('.');
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const [ivB64, tagB64, encB64] = ciphertext.split('.');
  if (!ivB64 || !tagB64 || !encB64) {
    throw new Error('ciphertext inválido');
  }
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const enc = Buffer.from(encB64, 'base64url');
  const decipher = createDecipheriv(ALGO, key, iv) as DecipherGCM;
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}
