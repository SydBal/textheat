import { defineConfig, loadEnv } from 'vite';

/** Deployment URL is supplied by the operator, never guessed from a hostname. */
export function siteMetadata(html: string, siteUrl?: string): string {
	let url: URL | undefined;
	if (siteUrl?.trim()) {
		url = new URL(siteUrl.trim());
		if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
			throw new Error('TEXTHEAT_SITE_URL must be an absolute HTTP(S) deployment URL without credentials, query, or fragment.');
		}
		if (!url.pathname.endsWith('/')) url.pathname += '/';
	}
	const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const image = url ? new URL('social/textheat-social.png', url).href : './social/textheat-social.png';
	const tags = url ? `<link rel="canonical" href="${escape(url.href)}">\n  <meta property="og:url" content="${escape(url.href)}">` : '';
	return html.replaceAll('__TEXTHEAT_SOCIAL_IMAGE__', escape(image)).replace('<!-- TEXTHEAT_SITE_META -->', tags);
}

export default defineConfig(({ mode, command }) => {
	const env = loadEnv(mode, process.cwd(), 'TEXTHEAT_');
	const siteUrl = command === 'build' ? (process.env.TEXTHEAT_SITE_URL ?? env.TEXTHEAT_SITE_URL) : undefined;
	if (command === 'build' && !siteUrl?.trim()) console.warn('TEXTHEAT_SITE_URL is unset: canonical/og:url omitted; social image uses a relative fallback. Set it for production.');
	return {
		root: 'demo',
		base: './',
		plugins: [{ name: 'textheat-site-metadata', transformIndexHtml: { order: 'pre', handler: (html) => siteMetadata(html, siteUrl) } }],
		build: { outDir: '../demo-dist', emptyOutDir: true },
	};
});