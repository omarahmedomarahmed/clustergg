// Where a redirect is allowed to send somebody. B103.
//
// ===== THE HOLE =====
//
// `/api/auth/discord?next=…` puts whatever it is given into a cookie, and the
// callback finishes with `NextResponse.redirect(new URL(dest, base))`.
//
// `new URL("https://evil.example", base)` does NOT resolve against the base. It
// returns the absolute URL, because that is what the URL constructor is for. So
// a link to
//
//     clustergg.com/api/auth/discord?next=https://evil.example/login
//
// signs somebody in on OUR domain and then drops them on somebody else's, with
// our name in the address bar for the whole hop. That is the classic phishing
// primitive: the victim checks the domain at the start, which is real, and
// never checks it again.
//
// ===== THE RULE =====
//
// A destination must be a PATH on this site. One leading slash, and never two —
// `//evil.example/x` is a protocol-relative URL and browsers treat it as
// absolute, which is the bypass every naive `startsWith("/")` check misses.
//
// Backslashes are rejected too: some browsers normalise `\` to `/`, so
// `/\evil.example` and `\\evil.example` have both worked as protocol-relative
// URLs in the wild.
//
// ===== IT FAILS TO A REAL PLACE =====
//
// A rejected destination returns the fallback rather than throwing. The person
// being redirected did nothing wrong — they clicked a link somebody sent them —
// and dropping them on an error page teaches them nothing while costing us the
// sign-in they were part-way through.

/** Where to send somebody when the destination they carried is not allowed. */
export const DEFAULT_NEXT = "/feed";

export function safeNext(raw: unknown, fallback: string = DEFAULT_NEXT): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return fallback;

  // Must be a path on this site.
  if (!v.startsWith("/")) return fallback;
  // …and not a protocol-relative URL wearing a path's clothes.
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // Backslashes anywhere in the authority position are a browser-normalisation
  // bypass. Cheaper to refuse them outright than to reason about which browser.
  if (v.includes("\\")) return fallback;
  // A scheme cannot appear in a path, so anything that looks like one is an
  // attempt: `/%2f%2fevil`, `/..;@evil`, and friends all fail the checks above,
  // but a literal `javascript:` inside a path is worth refusing by name.
  if (/^\/+\s*[a-z][a-z0-9+.-]*:/i.test(v)) return fallback;

  // Control characters, including the newline that would split a header.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;

  return v;
}
