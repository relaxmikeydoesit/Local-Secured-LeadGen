// Verifies the image guard really catches GPS EXIF and really removes it.
// Skipped automatically if sharp is not installed (run `npm install` first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let sharp;
try { sharp = (await import('sharp')).default; } catch { /* handled below */ }

const script = new URL('../scripts/sanitize-images.mjs', import.meta.url).pathname;
// The script resolves `sharp` relative to itself, so it runs from the project root.
const projectRoot = new URL('..', import.meta.url).pathname;

// Smallest practical way to produce a JPEG with GPS EXIF: write it via sharp's withExif.
async function geotagged() {
  return sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
    .withExif({ IFD0: { Copyright: 'x' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '39/1 46/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '86/1 9/1 0/1' } })
    .jpeg().toBuffer();
}

test('--check fails on a geotagged image; sanitize cleans it; --check then passes', { skip: !sharp && 'sharp not installed' }, async () => {
  const work = await mkdtemp(join(tmpdir(), 'img-'));
  try {
    await mkdir(join(work, 'src/assets'), { recursive: true });
    const file = join(work, 'src/assets/photo.jpg');
    await writeFile(file, await geotagged());
    assert.ok((await sharp(await readFile(file)).metadata()).exif, 'fixture should carry EXIF');

    // Script paths are relative to cwd, so run it inside the temp project.
    const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, NODE_PATH: projectRoot + 'node_modules' } });

    assert.equal(run('--check').status, 1);
    assert.equal(run().status, 0);
    assert.equal((await sharp(await readFile(file)).metadata()).exif, undefined);
    assert.equal(run('--check').status, 0);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
