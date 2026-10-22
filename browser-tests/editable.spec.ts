import { expect, test } from '@playwright/test';

// These tests run the real built content bundle in real Chromium against a
// contenteditable fixture. They certify the behaviors jsdom mocks cannot:
// selection preservation across wrapping, IME composition pause/resume, and
// undo-history behavior after programmatic highlight application.

const HIGHLIGHT = '[data-textheat-extension="highlight"]';

/** Character offsets of the current selection inside a root element,
 * computed by walking text content, the same math the renderer preserves.
 */
async function selectionOffsets(page: import('@playwright/test').Page, rootSelector: string) {
  return page.evaluate(root => {
    const rootElement = document.querySelector(root)!;
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const offsetOf = (node: Node, position: number) => {
      const range = document.createRange();
      range.selectNodeContents(rootElement);
      range.setEnd(node, position);
      return range.toString().length;
    };
    return {
      anchor: offsetOf(selection.anchorNode!, selection.anchorOffset),
      focus: offsetOf(selection.focusNode!, selection.focusOffset),
      text: selection.toString()
    };
  }, rootSelector);
}

async function applyAuto(page: import('@playwright/test').Page) {
  await page.evaluate(() => (window as never as { __applySettings(s: unknown): Promise<unknown> })
    .__applySettings((window as never as { __autoSettings(): unknown }).__autoSettings()));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/fixture/editor.html');
});

test('highlights plain and editable text with the real bundle', async ({ page }) => {
  await applyAuto(page);
  await expect(page.locator(`#plain ${HIGHLIGHT}`)).toHaveCount(3);
  await expect(page.locator(`#editor ${HIGHLIGHT}`)).toHaveCount(3);
  await expect(page.locator('#editor')).toHaveText('I love this wonderful product, but the service is terrible.');
});

test('preserves the selection across highlight application in an editor', async ({ page }) => {
  // Select "wonderful" (characters 12-21 of the draft) before enabling.
  await page.evaluate(() => {
    const draft = document.querySelector('#draft')!;
    const range = document.createRange();
    range.setStart(draft.firstChild!, 12);
    range.setEnd(draft.firstChild!, 21);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const before = await selectionOffsets(page, '#editor');
  expect(before).toEqual({ anchor: 12, focus: 21, text: 'wonderful' });

  await applyAuto(page);
  await expect(page.locator(`#editor ${HIGHLIGHT}`)).toHaveCount(3);

  // Wrapping split the text node into spans; the caret/selection must be
  // restored to the same characters, not the same (now removed) node.
  const after = await selectionOffsets(page, '#editor');
  expect(after).toEqual({ anchor: 12, focus: 21, text: 'wonderful' });
});

test('pauses DOM work during IME composition and resumes after it ends', async ({ page }, testInfo) => {
  await applyAuto(page);
  await expect(page.locator(`#editor ${HIGHLIGHT}`)).toHaveCount(3);

  await page.click('#draft');
  await page.keyboard.press('End');

  // Start a real IME composition through the DevTools protocol.
  const cdp = await page.context().newCDPSession(page);
  let realComposition = true;
  try {
    await cdp.send('Input.imeSetComposition', { text: 'かな', selectionStart: 2, selectionEnd: 2 });
  } catch {
    realComposition = false;
  }
  if (realComposition) {
    await expect.poll(() => page.evaluate(() =>
      (window as never as { __compositionEvents: string[] }).__compositionEvents.includes('compositionstart')
    )).toBe(true);
  } else {
    // Fallback: a synthetic composition still exercises the controller's
    // pause/resume wiring, but it is not IME certification. Say so.
    testInfo.annotations.push({ type: 'ime-path', description: 'synthetic composition events (CDP imeSetComposition unavailable)' });
    await page.evaluate(() => {
      const editor = document.querySelector('#editor')!;
      editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    });
  }

  // While composing, new sentiment text appears inside the editor. The
  // controller must not wrap or restore anything in the composing root yet.
  await page.evaluate(() => {
    const late = document.createElement('p');
    late.id = 'late';
    late.textContent = 'A wonderful surprise, truly joyful news.';
    document.querySelector('#editor')!.append(late);
  });
  await page.waitForTimeout(600);
  await expect(page.locator(`#late ${HIGHLIGHT}`)).toHaveCount(0);

  // Commit the composition; processing must resume for the whole editor.
  if (realComposition) {
    await cdp.send('Input.insertText', { text: 'かな' });
    await expect.poll(() => page.evaluate(() =>
      (window as never as { __compositionEvents: string[] }).__compositionEvents.includes('compositionend')
    )).toBe(true);
  } else {
    await page.evaluate(() => {
      document.querySelector('#editor')!
        .dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'かな' }));
    });
  }
  await expect(page.locator(`#late ${HIGHLIGHT}`).first()).toBeVisible();
  expect(await page.locator('#editor').textContent()).toContain('かな');
});

test('undo after highlight application never corrupts editor text', async ({ page }, testInfo) => {
  await applyAuto(page);
  await expect(page.locator(`#editor ${HIGHLIGHT}`)).toHaveCount(3);
  const initial = await page.locator('#editor').textContent();

  await page.click('#draft');
  await page.keyboard.press('End');
  await page.keyboard.type(' The ending felt awful.');
  const typed = await page.locator('#editor').textContent();
  expect(typed).toBe(`${initial} The ending felt awful.`);
  // The controller wraps the newly typed sentiment word in place.
  await expect(page.locator(`#editor ${HIGHLIGHT}`, { hasText: 'awful' })).toHaveCount(1);

  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const afterUndo = await page.locator('#editor').textContent();
  // Two safe outcomes exist in real Chrome: undo reverts the typing, or the
  // programmatic wrap invalidated the typing undo entry and undo is a no-op.
  // Corruption (duplication, partial words, lost text) is the failure.
  const reverted = afterUndo === initial;
  const noop = afterUndo === typed;
  testInfo.annotations.push({
    type: 'undo-outcome',
    description: reverted ? 'Ctrl+Z reverted the typing after wrapping' : noop ? 'Ctrl+Z was a no-op after wrapping (undo entry invalidated)' : `unexpected text: ${JSON.stringify(afterUndo)}`
  });
  expect(reverted || noop).toBe(true);

  // The editor must still be fully usable afterwards.
  await page.click('#draft');
  await page.keyboard.press('End');
  await page.keyboard.type(' OK');
  const finalText = await page.locator('#editor').textContent();
  expect(finalText?.endsWith(' OK')).toBe(true);
  expect(finalText?.match(/ OK/g)).toHaveLength(1);
});
