# Website deployment

The website is the Vite demo, with a downloadable **unpacked** Chrome extension.
It is not published in the Chrome Web Store. There are no third-party fonts,
images, analytics, or tracking scripts.

## Production build

Set **TEXTHEAT_SITE_URL** in your deployment environment to the actual public
HTTP(S) website URL before running **npm run demo:build** (on Windows use
**npm.cmd run demo:build**). Supply the full deployment path if hosted beneath
a subdirectory. No domain is supplied by the project.

The URL must not contain credentials, a query string, or a fragment. A trailing
slash is normalized automatically. Vite reads the variable from the process
environment or its mode-specific environment files at the repository root.
It is used only for public metadata, not as a client secret.

Build order:

1. **build:extension** builds the library and bundles the MV3 extension into
   the extension-dist directory, including the MIT license.
2. **site:prepare** packages those files into the website's downloadable ZIP,
   validates the ZIP again after writing, and rasterizes the authored social SVG.
3. Vite builds the static website and copies public assets into demo-dist.

Deploy the **entire** demo-dist directory. The relative download link resolves
to **downloads/textheat-chrome.zip**, including when hosted under a subdirectory.
The archive has its manifest at the root: unzip, open **chrome://extensions**,
enable **Developer mode**, choose **Load unpacked**, and select the extracted
folder. Keep the extracted folder on disk. The extension starts Off.

## Social metadata and assets

Vite injects absolute canonical, Open Graph URL, Open Graph image, and Twitter
image URLs from **TEXTHEAT_SITE_URL**. With no variable, development still works:
canonical and Open Graph URL are omitted and images use a relative fallback.
A build without it prints a warning. **Production deployments must set this
variable**: social crawlers generally require absolute image URLs.

The authored [social SVG](../demo/public/social/textheat-social.svg) and
[1200×630 PNG](../demo/public/social/textheat-social.png) are local assets, as is
the [favicon](../demo/public/favicon.svg). The PNG is generated using the pinned
installed sharp version. Generation uses fixed geometry, dimensions, and PNG
options; SVG system-font rendering can vary across operating systems, so use
the same Node/sharp/font environment for byte-for-byte image reproducibility.
The committed PNG supports development before a release build. To regenerate
only it, use **node scripts/prepare-site.mjs --social-only**.

The ZIP uses sorted paths and fixed timestamps, with no enclosing directory.
It includes LICENSE, manifest, background, content, popup, and options files.
Generated ZIPs are ignored by the downloads directory's local ignore rule;
publish the build output rather than committing release binaries.
**site:prepare** intentionally fails if extension artifacts are missing or invalid.
It does not silently build or fetch a prebuilt extension. For a development
download, build the extension first and then prepare the site.

## Release verification

[Website tests](../tests/site.test.ts) check the existing playground hooks,
download placement, installation/privacy wording, algorithm constants,
configured and fallback metadata, local asset dimensions, build ordering,
and deterministic ZIP generation against isolated fixtures. They do not run
the extension build. Run the focused tests, typecheck, and full release build
after concurrent development has finished.

Before deploying, verify the public download returns a ZIP (not your host's
SPA fallback), unzip it and load it in Chrome, and check the final HTML has the
correct canonical and absolute social URLs. Open the site in light/dark themes
and at mobile widths. Check that social crawlers can fetch the PNG without
authentication. The optional browser-native model is a **website-only** feature:
downloads require an explicit action; the extension contains no model inference.

The extension and playground do not collect, transmit, or store analyzed text;
only settings are stored locally. Hosting platforms can still log normal page
and asset requests independently of textheat. Choose and configure your host
accordingly; do not claim that deployment itself has no infrastructure logs.