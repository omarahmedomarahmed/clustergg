// What the page actually says.
//
// ===== `textContent("body")` IS NOT WHAT A PERSON READS =====
//
// It returns the text of every node, **including `<script>`**, and a Next.js
// page carries its whole RSC flight payload in one. So `textContent` on any
// page here contains every prop, every attribute value and every inline
// stylesheet, serialised.
//
// Two assertions in this band's first portal run failed because of it — one
// looking for the absence of the word "password" matched
// `"type":"password"` in the flight payload, and one checking that no email
// address appears matched `@media` in the inline CSS. Both pages were correct.
//
// The failures were harmless because they were **negative** assertions and
// therefore too strict. The dangerous direction is the other one: a positive
// check like `/Prize vault/.test(body)` passes if those words appear anywhere
// in a serialised prop, even when nothing on screen shows them. That is a
// browser test that photographs a blank page and reports success.
//
// So the band reads `innerText`, which is the rendered text of what is
// actually displayed.

import type { Page } from "playwright";

/** The rendered text of the page — what a person could read off the screen. */
export async function visible(page: Page, selector = "body"): Promise<string> {
  return page.locator(selector).first().innerText();
}
