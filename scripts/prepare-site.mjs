import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { unzipSync, zipSync, strFromU8 } from 'fflate';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = ['manifest.json', 'background/service-worker.js', 'content/content.js', 'content/styles.css', 'popup/popup.html', 'popup/popup.js', 'popup/popup.css', 'options/options.html', 'options/options.js', 'options/options.css', 'LICENSE'];
const fixedDate = new Date('2020-01-01T00:00:00Z');

export function validateExtensionZip(bytes) {
  const files = unzipSync(bytes);
  for (const path of requiredFiles) {
    if (!files[path]?.length) throw new Error(`Extension ZIP missing or empty: ${path}`);
  }
  if (Object.keys(files).some((path) => path.startsWith('/') || path.split('/').includes('..'))) throw new Error('Unsafe ZIP path');
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (manifest.manifest_version !== 3 || !manifest.version) throw new Error('Extension ZIP must contain a versioned MV3 manifest');
  const references = [manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_page];
  for (const path of references) if (!path || !files[path]?.length) throw new Error(`Extension ZIP has a missing manifest entry point: ${path}`);
  for (const path of [...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {})]) {
    if (!files[path]?.length) throw new Error(`Extension ZIP has a missing icon: ${path}`);
  }
  if (!strFromU8(files.LICENSE).includes('MIT License')) throw new Error('Extension ZIP must include the MIT LICENSE');
  return { version: manifest.version, files: Object.keys(files).length };
}

export async function generateSocialAsset(root = projectRoot) {
  const directory = resolve(root, 'demo/public/social');
  await mkdir(directory, { recursive: true });
  const svg = await readFile(resolve(directory, 'textheat-social.svg'));
  const png = await sharp(svg, { density: 72 }).resize(1200, 630).png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
  const metadata = await sharp(png).metadata();
  if (metadata.width !== 1200 || metadata.height !== 630 || metadata.format !== 'png') throw new Error('Invalid social image');
  await writeFile(resolve(directory, 'textheat-social.png'), png);
}

export async function prepareSite(root = projectRoot) {
  const source = resolve(root, 'extension-dist');
  const entries = {};
  async function collect(directory, prefix = '') {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const child of children) {
      const path = prefix + child.name;
      if (child.isDirectory()) await collect(resolve(directory, child.name), `${path}/`);
      else if (child.isFile()) entries[path] = [new Uint8Array(await readFile(resolve(directory, child.name))), { mtime: fixedDate }];
      else throw new Error(`Unexpected extension artifact: ${path}`);
    }
  }
  await collect(source);
  // Also support packaging an existing extension-dist built before LICENSE copying was added.
  entries.LICENSE = [new Uint8Array(await readFile(resolve(root, 'LICENSE'))), { mtime: fixedDate }];
  const bytes = zipSync(entries, { level: 9, mtime: fixedDate });
  const info = validateExtensionZip(bytes);
  const directory = resolve(root, 'demo/public/downloads');
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, 'textheat-chrome.zip');
  await writeFile(destination, bytes);
  validateExtensionZip(new Uint8Array(await readFile(destination)));
  await generateSocialAsset(root);
  console.log(`Prepared Chrome extension ${info.version}: ${info.files} files, ${bytes.length} bytes. Social image: 1200×630 PNG.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--social-only')) await generateSocialAsset();
  else await prepareSite();
}