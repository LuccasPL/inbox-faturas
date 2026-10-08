import { readFile, readdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('..', import.meta.url));
const secretNames = ['DATABASE_URL', 'APP_ENC_KEY', 'ANTHROPIC_API_KEY', 'CLERK_SECRET_KEY',
  'POSTMARK_OUTBOUND_TOKEN', 'POSTMARK_WEBHOOK_PASSWORD', 'EMAIL_WORKER_SECRET', 'N8N_WEBHOOK_URL'];

async function files(path) {
  const result = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) result.push(...await files(child));
    else if (/\.(js|json|map)$/.test(entry.name)) result.push(child);
  }
  return result;
}

try {
  await access(join(root, '.next', 'BUILD_ID'));
  let local = {};
  for (const filename of ['.env', '.env.production', '.env.local', '.env.production.local']) {
    try { local = { ...local, ...parse(await readFile(join(root, filename))) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const env = { ...local, ...process.env };
  const names = new Set([...secretNames, ...Object.keys(env).filter((name) =>
    /SECRET|PASSWORD|(?:API|ENC)_KEY|DATABASE_URL|POSTMARK.*TOKEN|N8N.*WEBHOOK_URL/.test(name))]);
  const secrets = [...new Set([...names].map((name) => env[name]).filter((value) => value && value.length >= 8))];
  const artifacts = await files(join(root, '.next', 'static'));
  let matches = 0;
  for (const path of artifacts) {
    const source = await readFile(path, 'utf8');
    if (secrets.some((value) => source.includes(value) || source.includes(JSON.stringify(value).slice(1, -1)))) matches++;
  }
  // Report counts only. Never print secret values, matching snippets or environment files.
  console.log(`Frontend: ${artifacts.length} ficheiros, ${secrets.length} segredos verificados, ${matches} exposições detetadas.`);
  if (matches) process.exitCode = 1;
  if (!secrets.length) {
    console.error('Verificação incompleta: não há valores de segredos disponíveis.');
    process.exitCode = 1;
  }
} catch {
  console.error('Não foi possível verificar o frontend. Executa o build e confirma o acesso local aos ficheiros.');
  process.exitCode = 1;
}
