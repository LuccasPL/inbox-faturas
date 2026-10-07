import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { test } from 'node:test';

test('client secret scanner detects leaks, never prints values and refuses incomplete checks', async () => {
  const parent = resolve('node_modules', '.cache');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, 'secret-check-'));
  assert.ok(root.startsWith(parent + sep));
  const canary = 'synthetic-secret-used-only-in-an-isolated-test';
  try {
    await mkdir(join(root, 'scripts'));
    await mkdir(join(root, '.next', 'static'), { recursive: true });
    await copyFile(new URL('../scripts/check-client-secrets.mjs', import.meta.url), join(root, 'scripts', 'check-client-secrets.mjs'));
    await writeFile(join(root, '.next', 'BUILD_ID'), 'isolated-fixture');
    await writeFile(join(root, '.env.local'), `APP_ENC_KEY=${canary}\n`);
    const run = () => spawnSync(process.execPath, [join(root, 'scripts', 'check-client-secrets.mjs')], {
      cwd: root, env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_OPTIONS: '' }, encoding: 'utf8',
    });
    await writeFile(join(root, '.next', 'static', 'client.js'), 'const label = "public";');
    const clean = run();
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /0 exposições/);
    await writeFile(join(root, '.next', 'static', 'client.js'), `const leaked = ${JSON.stringify(canary)};`);
    const leaked = run();
    assert.equal(leaked.status, 1);
    assert.match(leaked.stdout, /1 exposições/);
    assert.ok(!(leaked.stdout + leaked.stderr).includes(canary));
    await rm(join(root, '.env.local'));
    const incomplete = run();
    assert.equal(incomplete.status, 1);
    assert.match(incomplete.stderr, /Verificação incompleta/);
  } finally {
    assert.ok(resolve(root).startsWith(parent + sep));
    await rm(root, { recursive: true, force: true });
  }
});
