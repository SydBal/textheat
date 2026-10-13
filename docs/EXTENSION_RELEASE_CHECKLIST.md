# Extension release checklist

## Automated release gate

Run from the repository root, in this order (use `npm.cmd` on restricted Windows PowerShell):

1. `npm test` — rebuild shared exports and run the full regression suite.
2. `npm run typecheck` — verify library, extension, and tests.
3. `npm run test:package` — verify ESM/CommonJS/browser declarations and CLI.
4. `npm run demo:build` — rebuild the extension, branded PNG icons, licensed ZIP, and static website.
5. `npm run verify:extension` — inspect manifest references, permissions, icon dimensions, version agreement, footprint, and network-free/local-only bundles.
6. `npm audit` — review development and runtime dependency vulnerabilities.

The distribution is the contents of extension-dist, not the source extension folder. The website ZIP must have the manifest directly at its root and include LICENSE, all runtime entry points, styles, and icons. Preparing the ZIP verifies these references. Version 0.1.0 is a valid manifest version; choose a new version when actually publishing an update, and keep package/manifest versions aligned.

## Hardening covered by regression tests

- Only same-extension UI may write preferences; settings/site patches are validated, read/modify/write operations serialized, storage failures reported, and text never persisted. Preferences and explicitly configured hostnames use local storage only.
- Auto registers scripts only on granted HTTP(S) hosts. Off unregisters automatic scripts and removes existing highlights even when registration fails. Restricted pages and injection failures are handled without claiming success.
- Content initialization and persisted back/forward-cache restoration are revision-guarded. Late settings responses cannot reactivate a hidden/unloaded document or override a newer settings update. Duplicate injection creates one controller.
- Identical settings broadcasts do not cancel Manual tools or rebuild unchanged spans. New settings still clear prior work safely.
- Hidden, inert, password, unsupported controls, and extension UI remain excluded. Editable/design-mode text and code have separate default-Off opt-ins exposed in both popup and options. Rich-editor wrapping/restoration preserves selection offsets and pauses during IME composition; native inputs/textareas support Manual value/selection analysis without rewriting them. If highlighted content becomes ineligible, owned spans are removed. Read-only contenteditable islands remain readable; moving neutral nodes does not permanently detach visibility observation. Default preload is 0px; saved explicit values are preserved.
- Selected-text tools reject ranges that include protected content rather than analyzing an editable draft because the range started in readable text. Bounded node/character limits remain; iframe/shadow-root text is not traversed.
- DOM rendering uses text nodes and validated colors, preserves page listeners/forms, and restores original nodes when unchanged. Manual-panel close/Escape restores page focus if it was inside the panel; it is non-modal and does not trap page focus.
- Options preserve keyboard focus when rebuilding site actions. Hidden invalid custom-color drafts do not block unrelated saves; invalid active custom palettes still fail validation. Native site-form validity is checked before messaging.
- High-contrast, adaptive, and custom themes are tested. Adaptive contrast applies to generated opaque foreground/background pairs, not arbitrary page filters or overrides.

## Required real Chrome smoke test

- [ ] Verify Emoji reactions is Off on first install. Opt in from popup and options: newly revealed highlights burst once then retain one matching emoji; existing highlights get static badges. Scroll, resize, remove content, change sensitivity/theme, and turn Off/Clear. Confirm no residual particles/timers, no emoji additions to clipboard/editor text, and no changed highlight counts. Test OS reduced motion (static reactions), IME, links beneath overlays, and dense text in an actual Chrome tab.

These checks are **not proved by mocked Chrome APIs or a development harness**. Run them on the final ZIP using an ordinary, non-administrator Chrome profile; do not enter credentials into an AI tool.

- [ ] Unzip, open chrome://extensions, enable Developer mode, and Load unpacked from the extracted directory. Confirm name, icons, version, no manifest errors, and no service-worker errors.
- [ ] Fresh install starts Off, with Adaptive colors, and does not request blanket host access or analyze the page. Pin the toolbar icon and open the popup.
- [ ] Auto requests website access only from the explicit mode gesture. Deny once: previous mode remains. Grant once: accessible pages process progressively; permission removal stops future registration.
- [ ] Restrict host access through Chrome's extension controls. Confirm denied hosts and Chrome Web Store/browser pages fail gracefully. Check Off cleanup on previously processed tabs.
- [ ] Test Manual whole page, click-to-check, selection, clear, and assigned shortcuts. Check links/forms keep working, editable text is untouched by default, read-only islands work, Escape closes/cancels, and focus returns sensibly. Opt into editable processing and test rich-editor caret, backward selections, IME, undo/redo, paste, and site framework behavior. Check allowed native field values/selections analyze without modifications and passwords never enter analysis.
- [ ] On a long page, scroll to distant content and back. Verify no nested highlights, progressive discovery, once-only/reduced-motion presentation, and no sustained CPU activity at rest.
- [ ] Exercise insertion, text edits, hidden/inert/editable transitions, body replacement, SPA navigation, and back/forward-cache restoration. Confirm no stale settings overwrite newer changes.
- [ ] Save/reopen every theme and setting; try malformed/unsafe custom JSON, site sensitivity, Unicode/IPv6 hostnames, enable/disable/reset, and keyboard-only site actions. Confirm errors are visible, not reported as successful saves.
- [ ] Reload/update the unpacked extension and reload test tabs, then restart Chrome. Confirm local settings persist; old sync preferences require reconfiguration and are not silently uploaded/migrated.
- [ ] Inspect extension background/content network activity: no analysis requests or remote code. Ordinary page/hosting requests are outside the extension's no-transmission promise.
- [ ] Repeat on the minimum supported Chrome/Chromium baseline if claimed, plus other browsers you intend to advertise. Test at mobile-sized windows, zoom, high contrast, and reduced motion where applicable.

## Chrome Web Store submission (separate from ZIP availability)

- [ ] Publish a real, stable HTTPS privacy-policy URL describing website-content handling (including local processing), user-facing purposes, explicitly stored hostnames/preferences, permissions, retention/sharing, and the Chrome Web Store Limited Use commitment. Repository documentation is not a substitute for the final store link.
- [ ] Complete the dashboard's data-use disclosures accurately. Local processing can still count as handling user data for Store disclosures; assess website content, any selected/user-entered text, and explicitly saved hostnames against the dashboard's definitions. Align declarations, product behavior, listing, and policy; do not claim “no data handled” solely because processing is local.
- [ ] Ensure an in-product disclosure appears before page text is processed, explains what is handled and why, and states the local-only behavior. Auto and Manual activation are explicit, but the disclosure must also be prominent and understandable.
- [ ] Prepare accurate store description, screenshots of real behavior, and listing/promotion assets required by the current developer dashboard. Do not claim calibrated accuracy, universal compatibility, or browser/model capabilities not tested.
- [ ] Create at least one current, real Chrome Web Store screenshot at the dashboard's required dimensions and any required promotional images; the website social preview is not a listing screenshot.
	- Draft 1280×800 composed previews are in `store-listing/`; they are not live-extension captures and must not be submitted as screenshots. Replace them after testing the final ZIP in Chrome.
- [ ] Review the dashboard's current privacy disclosures and permission justifications: storage for preferences, activeTab for explicit Manual tools, scripting for bundled processing, optional hosts for Auto. No remote hosted executable code.
- [ ] Set the real public website URL and rebuild to emit absolute social-preview/canonical URLs. Confirm the published site's ZIP is the reviewed release.
- [ ] Submit through an authorized developer account and complete the store review. **This repository does not publish to the store or certify acceptance.** Until accepted, the website correctly describes unpacked installation, not a store install.

The code audit and automated gate reduce risk; they do not replace these real-browser and distribution steps.