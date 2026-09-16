#!/usr/bin/env node
/**
 * Copies just the actual game/site files into www/, which is what the
 * Capacitor Android project bundles into the APK's WebView assets.
 * The site has no build step and lives at the puzzle-cascade repo root
 * (that's what GitHub Pages serves directly) - this script exists only
 * so Capacitor has a clean subfolder to point webDir at, since it
 * refuses to use the project root itself. It never touches the real
 * site files; it only copies them.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEST = path.join(ROOT, 'www');

const INCLUDE = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'version.json',
  'shared',
  'games',
  'vendor',
  'icons',
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });

for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) {
    console.warn(`[prepare-android-www] skipping missing path: ${item}`);
    continue;
  }
  copyRecursive(src, path.join(DEST, item));
}

console.log(`[prepare-android-www] copied ${INCLUDE.length} entries into ${path.relative(ROOT, DEST)}/`);
