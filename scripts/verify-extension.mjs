import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
const root = resolve('extension-dist');
test('load-unpacked manifest references complete local bundled artifacts', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.minimum_chrome_version, '120');
  assert.equal(manifest.version, JSON.parse(readFileSync('package.json', 'utf8')).version);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.host_permissions, undefined);
  for (const file of [manifest.action.default_popup, manifest.options_page, manifest.background.service_worker, 'content/content.js', 'content/styles.css', 'popup/popup.js', 'options/options.js']) {
    assert.ok(existsSync(join(root, file)), file);
  }
  for (const entry of ['popup/popup.html', 'options/options.html']) {
    const html = readFileSync(join(root, entry), 'utf8');
    assert.ok(!/https?:\/\//.test(html), 'No remote executable/assets in extension UI');
    assert.ok(/script src="(?:popup|options)\.js"/.test(html));
  }
  for (const entry of ['content/content.js', 'background/service-worker.js', 'popup/popup.js', 'options/options.js']) {
    const js = readFileSync(join(root, entry), 'utf8');
    assert.ok(!/\b(?:eval|new Function)\s*\(/.test(js));
    assert.ok(!/from\s*['"](?:textheat|node:)/.test(js), 'Runtime packages must be bundled');
  }
});
test('extension is lightweight and declares exactly the documented Manual commands', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.commands), ['toggle-page', 'pick-text', 'check-selection']);
  function size(folder) { return readdirSync(folder).reduce((sum, entry) => { const path = join(folder, entry); const stat = statSync(path); return sum + (stat.isDirectory() ? size(path) : stat.size); }, 0); }
  const bytes = size(root);
  assert.ok(bytes < 300000, `${bytes} bytes exceeds footprint budget`);
  console.log(`Extension artifacts: ${bytes} bytes`);
});
test('local icons are correctly sized and all runtime bundles remain network-free', async () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  for (const size of [16, 32, 48, 128]) {
    const file = manifest.icons[String(size)];
    assert.ok(file && existsSync(join(root, file)));
    const metadata = await sharp(join(root, file)).metadata();
    assert.equal(metadata.width, size); assert.equal(metadata.height, size); assert.equal(metadata.format, 'png');
  }
  for (const file of Object.values(manifest.action.default_icon)) assert.ok(existsSync(join(root, file)));
  for (const entry of ['content/content.js', 'background/service-worker.js', 'popup/popup.js', 'options/options.js']) {
    const js = readFileSync(join(root, entry), 'utf8');
    assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(js), `${entry}: no runtime network clients`);
    assert.ok(!/storage\.sync\b/.test(js), `${entry}: preferences must stay local`);
  }
});