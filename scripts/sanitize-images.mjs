#!/usr/bin/env node
// Strips EXIF (incl. GPS), XMP and IPTC metadata from images.
//
//   node scripts/sanitize-images.mjs            rewrite images in place, without metadata
//   node scripts/sanitize-images.mjs --check    fail if any image still carries metadata (used by `npm run build` and CI)
//
// Why: photos taken on a phone embed the exact GPS position. For mobile detailers and dog
// trainers that means customers' home addresses. Run this before committing any photo.

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const DIRS = ['src/assets', 'public'];
const EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.tif', '.tiff']);
const check = process.argv.includes('--check');

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // directory does not exist
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (EXTS.has(extname(e.name).toLowerCase())) yield p;
  }
}

const leaks = (meta) => {
  const found = [];
  if (meta.exif) found.push('EXIF');
  if (meta.xmp) found.push('XMP');
  if (meta.iptc) found.push('IPTC');
  return found;
};

async function rewrite(buf, ext) {
  // rotate() bakes the EXIF orientation into the pixels so removing metadata can't flip the picture.
  // sharp drops all metadata on output unless withMetadata() is called.
  let img = sharp(buf, { failOn: 'error' }).rotate();
  switch (ext) {
    case '.jpg':
    case '.jpeg': return img.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    case '.png': return img.png().toBuffer();
    case '.webp': return img.webp({ quality: 88 }).toBuffer();
    case '.avif': return img.avif({ quality: 60 }).toBuffer();
    case '.tif':
    case '.tiff': return img.tiff().toBuffer();
  }
}

let scanned = 0;
const dirty = [];
const cleaned = [];

for (const root of DIRS) {
  for await (const file of walk(root)) {
    scanned++;
    const buf = await readFile(file);
    const found = leaks(await sharp(buf).metadata());
    if (found.length === 0) continue;

    if (check) {
      dirty.push(`${file} (${found.join(', ')})`);
      continue;
    }
    const ext = extname(file).toLowerCase();
    const out = await rewrite(buf, ext);
    // Re-read to confirm the result is really clean before overwriting the original.
    if (leaks(await sharp(out).metadata()).length > 0) {
      console.error(`Could not strip metadata from ${file}`);
      process.exit(1);
    }
    await writeFile(file, out);
    cleaned.push(`${file} (${found.join(', ')}; ${(await stat(file)).size} bytes)`);
  }
}

if (check) {
  if (dirty.length) {
    console.error('Images still contain metadata (may include GPS location):');
    for (const d of dirty) console.error('  - ' + d);
    console.error('\nFix with: npm run images:sanitize');
    process.exit(1);
  }
  console.log(`images:check OK, ${scanned} image(s) scanned, none carry EXIF/XMP/IPTC metadata.`);
} else {
  for (const c of cleaned) console.log('stripped ' + c);
  console.log(`Done. ${scanned} image(s) scanned, ${cleaned.length} cleaned.`);
}
