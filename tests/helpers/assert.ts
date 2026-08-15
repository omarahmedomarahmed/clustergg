// THE assertion module. There is exactly one, and this is it.
//
// Why that is a rule rather than a preference: the previous platform had 99
// test files and most of them declared their own `ok`/`eq`/`near` at the top.
// One of them declared none. Its three "assertions" in the weekly-close suite
// called a SQL builder and tested nothing — including the guard that stopped
// the server pool being drained by private challenges — and the suite was
// green the entire time. Ninety-eight correct copies did not help the file that
// had none.
//
// So: no suite declares an assertion. A guard walks the tree and fails the band
// if one does (`tests/band1/00-assertion-discipline.test.ts`).
//
// Three properties this module has that a hand-rolled `ok` does not:
//
//   1. **It counts.** Every call increments a counter the runner reads. A suite
//      that finishes having asserted nothing is a failure, not a pass.
//   2. **It refuses a value that cannot be compared.** Passing a query builder,
//      a promise or a function where a value belongs is the exact shape of the
//      dead-assertion bug: `eq(db.select()..., 3)` is not a comparison, it is a
//      typo that always fails quietly or always passes quietly. Both are
//      rejected loudly here.
//   3. **It requires a message.** "Expected true, got false" three frames deep
//      in a helper tells you nothing on a CI log.

// The counter lives on `globalThis` for the same reason the suite registry
// does (see `tests/helpers/suite.ts`): a `.ts` module in a CommonJS package
// gets one instance under a static `import` and another under the runner's
// dynamic `import()`. A module-scoped counter would read zero forever, and the
// runner would declare every suite silent — the exact failure this counter
// exists to detect, inverted.
declare global {
  // eslint-disable-next-line no-var
  var __clusterAssertions: number | undefined;
}

function bump(): void {
  globalThis.__clusterAssertions = (globalThis.__clusterAssertions ?? 0) + 1;
}

/** How many assertions have run. The runner reads this; suites do not. */
export function assertionCount(): number {
  return globalThis.__clusterAssertions ?? 0;
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

/**
 * Reject anything that is not a settled, comparable value.
 *
 * A thenable means somebody forgot an `await`; the comparison then runs against
 * a Promise object and can never be meaningful. A function means a query
 * builder, a matcher or a getter arrived where its result belonged. Both were
 * real, both shipped, and both looked like passing tests.
 */
function comparable(v: unknown, role: string, msg: string): void {
  if (typeof v === "function") {
    throw new AssertionError(
      `${msg}: ${role} is a function, not a value. An assertion against a ` +
        `builder or a getter tests nothing — call it, or await it.`,
    );
  }
  if (v !== null && typeof v === "object" && typeof (v as { then?: unknown }).then === "function") {
    throw new AssertionError(
      `${msg}: ${role} is a thenable, not a value. A missing await makes this ` +
        `assertion meaningless.`,
    );
  }
}

/** True, and nothing else. `ok(1)` is a bug, not a pass. */
export function ok(cond: unknown, msg: string): asserts cond {
  if (!msg) throw new AssertionError("ok() requires a message");
  bump();
  comparable(cond, "condition", msg);
  if (cond !== true) {
    throw new AssertionError(`${msg} — expected true, got ${show(cond)}`);
  }
}

/** The opposite, spelled out, so a negation never hides in a `!`. */
export function no(cond: unknown, msg: string): void {
  if (!msg) throw new AssertionError("no() requires a message");
  bump();
  comparable(cond, "condition", msg);
  if (cond !== false) {
    throw new AssertionError(`${msg} — expected false, got ${show(cond)}`);
  }
}

/** Deep structural equality. */
export function eq<T>(actual: T, expected: T, msg: string): void {
  if (!msg) throw new AssertionError("eq() requires a message");
  bump();
  comparable(actual, "actual", msg);
  comparable(expected, "expected", msg);
  if (!deepEqual(actual, expected)) {
    throw new AssertionError(
      `${msg}\n  expected: ${show(expected)}\n  actual:   ${show(actual)}`,
    );
  }
}

/**
 * Equality for numbers that went through arithmetic.
 *
 * `epsilon` defaults to a hundredth of a cent. Money on this platform is held
 * in cents as integers, so `near` is for ratios and KPI weights, not for
 * dollars — a dollar comparison that needs a tolerance is a dollar that was
 * stored as a float, which is its own defect.
 */
export function near(
  actual: number,
  expected: number,
  msg: string,
  epsilon = 1e-9,
): void {
  if (!msg) throw new AssertionError("near() requires a message");
  bump();
  comparable(actual, "actual", msg);
  comparable(expected, "expected", msg);
  if (typeof actual !== "number" || typeof expected !== "number") {
    throw new AssertionError(
      `${msg} — near() compares numbers; got ${show(actual)} and ${show(expected)}`,
    );
  }
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) {
    throw new AssertionError(
      `${msg} — near() needs finite numbers; got ${show(actual)} and ${show(expected)}`,
    );
  }
  if (Math.abs(actual - expected) > epsilon) {
    throw new AssertionError(
      `${msg}\n  expected: ${expected} (±${epsilon})\n  actual:   ${actual}`,
    );
  }
}

/**
 * Assert that something throws, and that the reason says why.
 *
 * `match` is required. A guard proven only by "it threw" is proven against the
 * wrong error as easily as the right one — a typo in the code under test also
 * throws.
 */
export async function throws(
  fn: () => unknown,
  match: RegExp,
  msg: string,
): Promise<Error> {
  if (!msg) throw new AssertionError("throws() requires a message");
  bump();
  let caught: unknown;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  if (caught === undefined) {
    throw new AssertionError(`${msg} — expected a throw, nothing was thrown`);
  }
  if (caught instanceof AssertionError) throw caught;
  const text = caught instanceof Error ? caught.message : String(caught);
  if (!match.test(text)) {
    throw new AssertionError(
      `${msg} — threw, but the reason did not match ${match}\n  reason: ${text}`,
    );
  }
  return caught instanceof Error ? caught : new Error(text);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every(
    (k) =>
      Object.prototype.hasOwnProperty.call(b, k) &&
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
  );
}

function show(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "bigint") return `${v}n`;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
