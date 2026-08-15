// Test registration. Deliberately tiny, and deliberately not a framework.
//
// A suite file calls `test(name, fn)` at module scope; importing the file
// registers, and the runner drains what was registered. No globals injected by
// a harness, no magic — so a suite can also be imported by the mutation
// harness without a second runtime.

export type Case = {
  name: string;
  fn: () => void | Promise<void>;
  file: string;
};

// The registry hangs off `globalThis`, not off this module's scope, and that
// is not decoration. This file is a `.ts` in a CommonJS package, so a static
// `import` of it resolves to a CJS instance while the runner's dynamic
// `import()` of a suite resolves to an ESM one — two live copies of this
// module, two empty arrays, and a runner that reports "suite registered no
// tests" for suites full of them. Found by running it. A module-scoped array
// here is correct-looking and silently wrong.
declare global {
  // eslint-disable-next-line no-var
  var __clusterTestRegistry: Case[] | undefined;
}

const registry: Case[] = (globalThis.__clusterTestRegistry ??= []);

export function test(name: string, fn: () => void | Promise<void>): void {
  registry.push({ name, fn, file: "" });
}

/** Take everything registered since the last drain. */
export function drain(file: string): Case[] {
  const taken = registry.splice(0, registry.length);
  for (const c of taken) c.file = file;
  return taken;
}
