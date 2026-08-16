// Finding Chromium, without depending on one image's directory layout.
//
// ===== WHY THIS IS NOT A CONSTANT =====
//
// Every band-2 pass used to launch with
// `executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"`.
// That worked in the container it was written in and failed in the next one,
// where `/opt/pw-browsers/chromium` is a **directory** and the real binary is
// under `chromium-<build>/chrome-linux/chrome` — a build number that moves
// whenever either the image or the pinned Playwright version does.
//
// The failure is loud but uninformative: Playwright reports a path that does
// not exist and suggests re-downloading, which is exactly what
// `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` is set to prevent. So this resolves the
// binary by looking, and says clearly what it looked at when it cannot find
// one — a browser pass that cannot start must not read as a product failure.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";

/** The paths a Chromium build puts its executable at, newest layout first. */
const CANDIDATES = [
  "chrome-linux/chrome",
  "chrome-linux/headless_shell",
  "chrome-headless-shell-linux64/chrome-headless-shell",
];

export function chromiumPath(): string {
  // An explicit override always wins, and is checked rather than trusted: a
  // typo'd env var should say so here, not inside Playwright's downloader.
  const override = process.env.CHROMIUM_PATH;
  if (override) {
    if (fs.existsSync(override)) return override;
    throw new Error(`CHROMIUM_PATH is set to ${override}, and nothing is there.`);
  }

  const looked: string[] = [];
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(ROOT);
  } catch {
    throw new Error(`No browser directory at ${ROOT}. Set CHROMIUM_PATH.`);
  }

  // Prefer a full Chromium over a headless shell: the screenshot record is the
  // deliverable, and the two do not always render identically.
  const ordered = [
    ...dirs.filter((d) => /^chromium-/.test(d)).sort().reverse(),
    ...dirs.filter((d) => /^chromium/.test(d) && !/^chromium-/.test(d)).sort().reverse(),
  ];

  for (const dir of ordered) {
    for (const candidate of CANDIDATES) {
      const full = path.join(ROOT, dir, candidate);
      looked.push(full);
      if (fs.existsSync(full)) return full;
    }
  }

  throw new Error(
    `No Chromium executable found. Looked at:\n  ${looked.join("\n  ")}\n` +
      `Set CHROMIUM_PATH to the binary if it lives somewhere else.`,
  );
}
