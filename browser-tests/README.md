# textheat browser tests (real-Chromium certification)

Dev tooling only: nothing in this directory ships in the library, the demo
site, or the extension ZIP.

The jsdom suites under `../tests/` mock the browser. This harness exists
because EXTENSION.md is explicit that mocks are not certification for
editable regions. It runs the **real built content bundle**
(`../extension-dist/content/content.js`, rebuilt by `pretest`) in **real
Chromium** (Playwright) against a `contenteditable` fixture page, with a
minimal `chrome.*` shim (the bundle only touches `chrome.runtime.id`,
`chrome.runtime.onMessage`, and `chrome.runtime.sendMessage`).

## Run

```sh
npm install
npm run install-browser   # one-time Chromium download
npm test
```

## What it certifies

- The shipped bundle boots from stored settings and highlights both plain
  page text and opted-in editable text, without changing the text itself.
- **Selection preservation:** a selection made before highlighting is
  restored to the same character offsets after the controller wraps the
  text nodes in highlight spans.
- **IME composition pause/resume:** a real composition started through the
  DevTools protocol (`Input.imeSetComposition`) pauses controller DOM work
  inside the composing editor; text added mid-composition is not wrapped
  until `compositionend`, after which processing resumes.
- **Undo behavior:** after the controller wraps freshly typed text,
  Ctrl+Z in Chrome 145 is a **no-op** (the programmatic wrap invalidates
  the typing undo entry). The test asserts the safe outcomes — text is
  never corrupted or duplicated and the editor stays usable — and records
  which outcome the browser produced as a test annotation.

## What it does not certify

Real Gmail, Facebook, or other production editors, whose own frameworks
mediate input and undo. Those still require manual testing; this harness
certifies textheat's behavior in a standards-based `contenteditable`
region in a real browser engine, which is the strongest claim available
without a production editor account.
