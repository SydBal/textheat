import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const require = createRequire(import.meta.url);
test('ESM package exports and browser entry import without DOM globals', async () => {
  assert.equal(typeof globalThis.document, 'undefined');
  for (const entry of ['textheat', 'textheat/core', 'textheat/browser']) {
    const api = await import(entry);
    assert.equal(typeof api.heat, 'function');
    assert.equal(api.analyze('not good').sentiment.label, 'negative');
    assert.ok(api.default.heat('wonderful').includes('textheat-highlight'));
  }
  const standalone = await import('../dist/textheat.browser.js');
  assert.equal(typeof standalone.default.mount, 'function');
  assert.equal(typeof standalone.default.analyzeWithNative, 'function');
  assert.equal(await standalone.nativeAvailability(), 'unsupported');
  const fallback = await standalone.analyzeWithNative('ambiguous text', { native: { mode: 'always' } });
  assert.equal(fallback.metadata.native.reason, 'unsupported');
  assert.ok(Array.isArray(fallback.clauses));
  assert.ok(Array.isArray(fallback.aspects));
  const source = readFileSync(new URL('../dist/textheat.browser.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]node:/.test(source));
});
test('CommonJS and declarations/styles/CLI artifacts', () => {
  for (const entry of ['textheat', 'textheat/core', 'textheat/browser']) {
    const api = require(entry);
    assert.equal(api.analyze('awful').sentiment.label, 'negative');
    assert.ok(api.heat('wonderful').includes('textheat-highlight'));
  }
  for (const file of ['index.d.ts', 'index.d.cts', 'browser.d.ts', 'browser.d.cts', 'cli.js']) assert.ok(existsSync(new URL(`../dist/${file}`, import.meta.url)), file);
  assert.ok(readFileSync(require.resolve('textheat/styles.css'), 'utf8').includes('focus'));
  assert.ok(existsSync(require.resolve('textheat/styles/dark.css')));
  assert.ok(readFileSync(require.resolve('textheat/cli'), 'utf8').startsWith('#!/usr/bin/env node'));
});