# Chrome Web Store screenshot candidates

- `01-reading-with-textheat.png` — local highlight example and popup modes/Manual tools.
- `02-personalize-your-highlights.png` — extension settings and site preferences.

These are composed layout previews based on the current extension UI, not captures from a live installed Chrome extension. Use them to plan the listing; **do not submit them as genuine product screenshots**. Before store submission, replace them with screenshots captured from the final extension ZIP in an ordinary Chrome profile, as required by `docs/EXTENSION_RELEASE_CHECKLIST.md`.

Regenerate the previews with `node scripts/capture-store-screenshots.mjs`. Chrome or Edge must be installed; set `CHROME_PATH` if it is outside a standard Windows location. The script checks that outputs are 1280×800 PNGs.
