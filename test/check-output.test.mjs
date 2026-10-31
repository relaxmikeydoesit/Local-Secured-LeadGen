// Tests for scripts/check-output.mjs (the post-build CSP guard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = new URL('../scripts/check-output.mjs', import.meta.url).pathname;

async function run(html) {
  const dir = await mkdtemp(join(tmpdir(), 'co-'));
  try {
    await writeFile(join(dir, 'index.html'), html);
    return spawnSync(process.execPath, [script, dir], { encoding: 'utf8' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('clean page passes (external same-origin script and ld+json are fine)', async () => {
  const r = await run('<html><head><script src="/_astro/a.js"></script><script type="application/ld+json">{"a":1}</script></head><body>hi</body></html>');
  assert.equal(r.status, 0, r.stderr);
});

test('Turnstile script is allowed', async () => {
  const r = await run('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>');
  assert.equal(r.status, 0, r.stderr);
});

for (const [label, html] of [
  ['inline script', '<script>alert(1)</script>'],
  ['style element', '<style>a{}</style>'],
  ['style attribute', '<p style="color:red">x</p>'],
  ['event handler', '<img src="/a.png" onerror="x()">'],
  ['javascript: URL', '<a href="javascript:alert(1)">x</a>'],
  ['unapproved external script', '<script src="https://cdn.evil.example/x.js"></script>'],
  ['unapproved external stylesheet', '<link rel="stylesheet" href="https://fonts.example/x.css">'],
]) {
  test(`fails on ${label}`, async () => {
    const r = await run(`<html><body>${html}</body></html>`);
    assert.equal(r.status, 1);
  });
}
