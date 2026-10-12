import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
const root = resolve('extension-dist');
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
for (const folder of ['popup', 'options', 'content']) {
  await mkdir(resolve(root, folder), { recursive: true });
  for (const suffix of folder === 'content' ? ['styles.css'] : [`${folder}.html`, `${folder}.css`]) await cp(resolve('extension', folder, suffix), resolve(root, folder, suffix));
}
await cp('extension/manifest.json', resolve(root, 'manifest.json'));
await cp('LICENSE', resolve(root, 'LICENSE'));
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Expected MV3');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
if (manifest.version !== pkg.version) throw new Error('Extension and package versions must match');
await mkdir(resolve(root, 'icons'), { recursive: true });
const icon = await readFile('extension/icons/icon.svg');
for (const size of [16, 32, 48, 128]) await sharp(icon).resize(size, size).png().toFile(resolve(root, `icons/icon-${size}.png`));
await build({ entryPoints: { 'content/content': 'extension/content/content.ts', 'popup/popup': 'extension/popup/popup.ts', 'options/options': 'extension/options/options.ts' }, outdir: root, bundle: true, format: 'iife', platform: 'browser', target: 'chrome120', minify: true });
await build({ entryPoints: { 'background/service-worker': 'extension/background/service-worker.ts' }, outdir: root, bundle: true, format: 'esm', platform: 'browser', target: 'chrome120', minify: true });
// Record reproducible artifact details without collecting any user data.
await writeFile(resolve(root, 'BUILD.txt'), `textheat ${manifest.version}\nManifest V3 Chromium extension — not published in the Chrome Web Store.\nUnzip, open chrome://extensions, enable Developer mode, choose Load unpacked, and select this folder.\nOff by default. Analysis stays local; text is never collected, transmitted, or stored. Only settings are stored locally.\nSee docs/EXTENSION.md in the repository.\n`);
console.log(`Load unpacked: ${root}`);