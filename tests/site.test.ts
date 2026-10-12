import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { siteMetadata } from '../vite.config';
import { lexiconStats } from '../src/api/index';

const root = process.cwd();
const html = readFileSync(resolve(root, 'demo/index.html'), 'utf8');
const document = new JSDOM(html).window.document;
const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts;
const preparationUrl = pathToFileURL(resolve(root, 'scripts/prepare-site.mjs')).href;
const tooling = () => import(/* @vite-ignore */ preparationUrl) as Promise<{
  prepareSite(root: string): Promise<void>;
  validateExtensionZip(bytes: Uint8Array): { version: string; files: number };
}>;

describe('public website', () => {
  it('keeps the playground first, two hero actions, and the download section last above the footer', () => {
    for (const id of ['theme-toggle', 'input', 'char-count', 'clear', 'output', 'sentiment-label', 'result-summary', 'threshold', 'threshold-value', 'tooltips', 'aspects', 'clauses', 'evidence', 'attribution-status', 'ambiguity', 'native-status', 'native-auto', 'native-analyze', 'native-assessment']) {
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
    }
    expect(document.querySelector('.hero')?.nextElementSibling?.classList.contains('workspace')).toBe(true);
    expect(document.querySelector('.hero .eyebrow')).toBeNull();
    expect(document.querySelector('.brand .version')).toBeNull();
    expect(document.querySelector('#workspace-heading h2')).toBeNull();
    expect(document.querySelector('.toggle-control strong')?.textContent).toBe('Highlight Hover Context Tooltip');
    const navigation = [...document.querySelectorAll('nav[aria-label="Main"] a')].map(link => link.getAttribute('href'));
    expect(navigation.indexOf('#how-it-works')).toBeLessThan(navigation.indexOf('#privacy'));
    expect(document.querySelectorAll('.workspace textarea')).toHaveLength(1);
    expect(document.querySelector('.live-editor #input')).not.toBeNull();
    expect(document.querySelector('.live-editor #output')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('.editor-grid')).toBeNull();
    expect(document.querySelector('.workspace')?.nextElementSibling?.classList.contains('legend')).toBe(true);
    expect(document.querySelector('.legend')?.nextElementSibling?.classList.contains('examples')).toBe(true);
    expect(document.querySelector('.examples')?.nextElementSibling?.classList.contains('analysis-insights')).toBe(true);
    expect(document.querySelector('main')?.lastElementChild?.id).toBe('extension-download');
    expect(document.querySelector('#privacy')?.nextElementSibling?.id).toBe('extension-download');
    expect(document.querySelector('main')?.nextElementSibling?.tagName).toBe('FOOTER');
    const actions = document.querySelectorAll('.hero-actions a');
    const emoji = document.querySelector<HTMLInputElement>('.hero #hero-emoji')!;
    expect(emoji.type).toBe('checkbox'); expect(emoji.checked).toBe(false);
    expect(document.querySelector('.hero > p')!.compareDocumentPosition(emoji) & 4).toBeTruthy();
    expect(emoji.compareDocumentPosition(document.querySelector('.hero-actions')!) & 4).toBeTruthy();
    expect(actions).toHaveLength(2);
    expect(actions[0]?.getAttribute('href')).toBe('./downloads/textheat-chrome.zip');
    expect(actions[0]?.hasAttribute('download')).toBe(true);
    expect(actions[1]?.getAttribute('href')).toBe('#extension-download');
    expect(actions[1]?.textContent).toContain('More info');
    expect(document.querySelectorAll('a[download="textheat-chrome.zip"]')).toHaveLength(2);
    const link = document.querySelector('#extension-download a[download]');
    expect(link?.getAttribute('href')).toBe('./downloads/textheat-chrome.zip');
    expect(link?.getAttribute('download')).toBe('textheat-chrome.zip');
    const banner = document.querySelector('#extension-download')!.textContent!;
    for (const wording of ['unzip', 'chrome://extensions', 'Developer mode', 'Load unpacked', 'Off', 'Not published in the Chrome Web Store']) expect(banner).toContain(wording);
  });

  it('explains privacy, algorithm constants, uncertainty and the website-only optional model', () => {
    const privacy = document.querySelector('#privacy')!.textContent!;
    expect(privacy).toContain('does not collect, transmit, or store');
    expect(privacy).toContain('Only settings are stored locally');
    expect(privacy).toContain('Off by default');
    const explanation = document.querySelector('.algorithm-section')!.textContent!;
    for (const value of ['8 tokens', '−0.7', 'abs(score) / 4', '0.08', '[0, 1]', '0.30', '0.50', 'not a probability', '4.5:1', 'Emotion colors take precedence', 'sarcasm', 'website only', 'explicit click', 'not part of the extension', 'free of bugs', 'Not just good', '0.65', '18-token']) expect(explanation).toContain(value);
    for (const [field, value] of Object.entries(lexiconStats)) expect(document.querySelector(`[data-lexicon-stat="${field}"]`)?.textContent).toBe(value.toLocaleString('en-US'));
    expect(document.querySelectorAll('script[src^="https:"], link[href^="https:"], img[src^="https:"]')).toHaveLength(0);
  });

  it('emits absolute canonical and social URLs only from the configured deployment URL', () => {
    const configured = new JSDOM(siteMetadata(html, 'https://deployment.invalid/textheat')).window.document;
    expect(configured.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://deployment.invalid/textheat/');
    expect(configured.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://deployment.invalid/textheat/');
    for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) expect(configured.querySelector(selector)?.getAttribute('content')).toBe('https://deployment.invalid/textheat/social/textheat-social.png');
    const fallback = new JSDOM(siteMetadata(html)).window.document;
    expect(fallback.querySelector('link[rel="canonical"], meta[property="og:url"]')).toBeNull();
    expect(fallback.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe('./social/textheat-social.png');
    expect(fallback.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    expect(siteMetadata(html)).not.toContain('__TEXTHEAT_');
    expect(siteMetadata(html)).not.toContain('TEXTHEAT_SITE_META');
    for (const url of ['not a URL', 'ftp://deployment.invalid', 'https://name:secret@deployment.invalid', 'https://deployment.invalid/?x=y', 'https://deployment.invalid/#part']) expect(() => siteMetadata(html, url)).toThrow();
  });

  it('ships a real 1200×630 PNG, its authored SVG, and a local SVG favicon', async () => {
    const png = await readFile(resolve(root, 'demo/public/social/textheat-social.png'));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(await sharp(png).metadata()).toMatchObject({ format: 'png', width: 1200, height: 630 });
    expect(readFileSync(resolve(root, 'demo/public/social/textheat-social.svg'), 'utf8')).toContain('viewBox="0 0 1200 630"');
    expect(readFileSync(resolve(root, 'demo/public/favicon.svg'), 'utf8')).toContain('<svg');
    expect(document.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('./favicon.svg');
  });

  it('builds the extension before preparing the download and running Vite', () => {
    expect(scripts['site:prepare']).toBe('node scripts/prepare-site.mjs');
    expect(scripts['demo:build']).toBe('npm run build:extension && npm run site:prepare && vite build');
    expect(readFileSync(resolve(root, 'scripts/build-extension.mjs'), 'utf8')).toContain("await cp('LICENSE'");
    expect(readFileSync(resolve(root, 'demo/public/downloads/.gitignore'), 'utf8')).toContain('*.zip');
  });

  it('packages and validates a deterministic self-contained unpacked ZIP using isolated fixtures', async () => {
    const { prepareSite, validateExtensionZip } = await tooling();
    const fixture = await mkdtemp(resolve(tmpdir(), 'textheat-site-'));
    try {
      const files: Record<string, string> = {
        'manifest.json': JSON.stringify({ manifest_version: 3, version: '0.1.0', background: { service_worker: 'background/service-worker.js' }, action: { default_popup: 'popup/popup.html' }, options_page: 'options/options.html' }),
        'background/service-worker.js': '// background', 'content/content.js': '// content', 'content/styles.css': 'body {}',
        'popup/popup.html': '<p>Popup</p>', 'popup/popup.js': '// popup', 'popup/popup.css': 'body {}',
        'options/options.html': '<p>Options</p>', 'options/options.js': '// options', 'options/options.css': 'body {}',
      };
      for (const [path, contents] of Object.entries(files)) {
        const destination = resolve(fixture, 'extension-dist', path);
        await mkdir(resolve(destination, '..'), { recursive: true });
        await writeFile(destination, contents);
      }
      await writeFile(resolve(fixture, 'LICENSE'), readFileSync(resolve(root, 'LICENSE')));
      await mkdir(resolve(fixture, 'demo/public/social'), { recursive: true });
      await writeFile(resolve(fixture, 'demo/public/social/textheat-social.svg'), readFileSync(resolve(root, 'demo/public/social/textheat-social.svg')));
      await prepareSite(fixture);
      const destination = resolve(fixture, 'demo/public/downloads/textheat-chrome.zip');
      const first = new Uint8Array(await readFile(destination));
      expect(validateExtensionZip(first)).toMatchObject({ version: '0.1.0', files: 11 });
      expect(Object.keys(unzipSync(first))).toContain('LICENSE');
      expect(Object.keys(unzipSync(first))).not.toContain('extension-dist/manifest.json');
      await prepareSite(fixture);
      expect(new Uint8Array(await readFile(destination))).toEqual(first);
      const incomplete = zipSync({ 'manifest.json': strToU8(files['manifest.json']!) });
      expect(() => validateExtensionZip(incomplete)).toThrow(/missing or empty/);
      const invalid = unzipSync(first);
      invalid['manifest.json'] = strToU8(JSON.stringify({ manifest_version: 2, version: '0.1.0' }));
      expect(() => validateExtensionZip(zipSync(invalid))).toThrow(/MV3/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});