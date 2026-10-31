#!/usr/bin/env node
// Post-build guard: the CSP in public/_headers forbids inline scripts, inline styles and
// inline event handlers. If the build emitted any, the site would break in production
// (or someone would be tempted to weaken the CSP). Fail the build instead.
//
//   node scripts/check-output.mjs dist

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2] || 'dist';
const problems = [];

async function* walk(d) {
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

// Allowed inline script types are non-executable data blocks.
const DATA_SCRIPT = /type\s*=\s*["']application\/(ld\+json|json)["']/i;

for await (const file of walk(dir)) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(file, 'utf8');

  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    const body = m[2].trim();
    const external = /\bsrc\s*=/.test(attrs);
    if (!external && body && !DATA_SCRIPT.test(attrs)) problems.push(`${file}: inline <script>`);
  }
  if (/<style\b/i.test(html)) problems.push(`${file}: <style> element`);
  if (/\sstyle\s*=\s*["']/i.test(html)) problems.push(`${file}: inline style="" attribute`);
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) problems.push(`${file}: inline event handler attribute`);
  if (/javascript:/i.test(html)) problems.push(`${file}: javascript: URL`);

  // Every external script/stylesheet origin must be one the CSP allows.
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    const u = new URL(m[1]);
    if (u.origin !== 'https://challenges.cloudflare.com' && !/^<link[^>]*rel=["'](canonical|alternate)/i.test(m[0])) {
      problems.push(`${file}: external resource ${u.origin} is not in the CSP allowlist`);
    }
  }
}

if (problems.length) {
  console.error('check-output FAILED:\n  - ' + [...new Set(problems)].join('\n  - '));
  process.exit(1);
}
console.log('check-output OK: no inline scripts/styles/handlers, no unapproved external resources.');
