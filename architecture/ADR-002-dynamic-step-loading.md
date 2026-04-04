# ADR-002: Runtime Dynamic Step Loading

**Status:** Accepted  
**Date:** 2026-04-04  
**Author:** ngwes

---

## Context

ADR-001 defines a static pipeline: an array of `Step<L, Ctx>` passed to `createPipeline` at compile time. All steps are statically known and included in the caller's bundle.

The need arises to load steps from files **at runtime**, without them being part of the compiled code. Typical use cases:

- Plugins installed by the end user in a local directory (`./extensions/`)
- Steps that vary between environments (dev/prod) without recompilation
- Steps provided by third parties as standalone packages or files
- Micro-kernel architectures where the core pipeline is stable but behaviour is extensible

The primary technical reference is [pi-mono extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md), which solves the same problem using `jiti` to execute TypeScript files without compilation.

---

## Decision

Use **jiti** as the runtime TypeScript loader for dynamic steps.

`createPipeline` **remains unchanged**: loading functions operate *before* pipeline creation and return normal `Step<L, Ctx>` arrays, fully compatible with the existing API.

### Why not zero-dependency native Node.js

Node.js offers two built-in flags for TypeScript files:

| Flag | From | What it does | `enum`? |
|---|---|---|---|
| `--experimental-strip-types` | 22.6 | Removes type annotations | ❌ no |
| `--experimental-transform-types` | 22.7 | Full transform via SWC (amaro) | ✅ yes |

Both flags are **experimental**: names and behaviour may change across Node releases. Requiring an experimental flag in a library intended for third-party consumption is an unacceptable constraint to place on consumers.

Additionally, `--experimental-strip-types` does not actually execute TypeScript — it mechanically removes type annotations and then runs the resulting JavaScript. Constructs that require real transformation (`enum`, `namespace`, legacy decorators) are not handled.

### jiti vs tsx — comparison

Both are runtime TypeScript loaders with programmatic APIs. The comparison:

| | **jiti v2** | **tsx** |
|---|---|---|
| Internal engine | Oxc (Rust) | esbuild (Go) |
| Programmatic API | `createJiti(url).import(path)` | `tsImport(path, importMeta)` |
| ESM support | ✅ native | ✅ native |
| `enum` / `namespace` | ✅ yes | ✅ yes |
| CJS interop | ✅ yes | ✅ yes |
| Cache | built-in, configurable | Node module cache |
| Used by | Nuxt, Nitro, Vite ecosystem, pi-mono | wide general use |
| Weekly downloads (approx.) | ~50M | ~30M |

**Pros of jiti:**
- Battle-tested in the Nuxt / Nitro / Vite ecosystem and explicitly used by pi-mono (the reference project for this feature)
- Built-in cache with invalidation control via `jitiOptions.moduleCache`
- v2 uses Oxc — extremely fast, native Rust
- Programmatic API designed for library use: `createJiti(parentUrl)` scopes resolution correctly

**Cons of jiti:**
- Adds a runtime dependency (though small: ~40 KB)
- Oxc does not do type-checking (neither does any alternative short of `tsc`)

**Pros of tsx:**
- Slightly more minimal API surface
- esbuild is more widely known in the ecosystem

**Cons of tsx:**
- Cache control less granular than jiti
- Not used by pi-mono; less battle-tested for this specific embedded-loader use case

**Chosen: jiti**, because it is used by pi-mono — the direct inspiration for this feature — and is proven in production across major meta-frameworks in the Node.js ecosystem.

### Public types

```typescript
/**
 * A dynamic step module must export as default:
 * - a single Step<L, Ctx>, or
 * - a ReadonlyArray<Step<L, Ctx>>
 *
 * Alternatively, it may use the named export `steps`.
 */
type DynamicStepModule<L, Ctx> =
  | { default: Step<L, Ctx> }
  | { default: ReadonlyArray<Step<L, Ctx>> }
  | { steps: ReadonlyArray<Step<L, Ctx>> };

/**
 * Load steps from an array of absolute or cwd-relative paths.
 * Accepts .ts, .js, .mjs — jiti handles TypeScript transparently.
 * Throws if a module does not conform to the contract.
 */
async function loadSteps<L, Ctx>(
  paths: ReadonlyArray<string>
): Promise<ReadonlyArray<Step<L, Ctx>>>;

/**
 * Scan a directory and load all files matching the pattern
 * (default: /\.(ts|js|mjs|cjs)$/).
 * Files are loaded in alphabetical order for determinism.
 */
async function loadStepsFromDir<L, Ctx>(
  dir: string,
  options?: { pattern?: RegExp }
): Promise<ReadonlyArray<Step<L, Ctx>>>;
```

### Reference implementation

```typescript
import { createJiti } from 'jiti';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Step } from './pipeline.js';

// One jiti instance per module — scopes resolution to the caller's URL.
const jiti = createJiti(import.meta.url);

export async function loadSteps<L, Ctx>(
  paths: ReadonlyArray<string>
): Promise<ReadonlyArray<Step<L, Ctx>>> {
  const loaded: Step<L, Ctx>[] = [];

  for (const p of paths) {
    const mod = await jiti.import(resolve(p)) as Record<string, unknown>;
    const exported: unknown = mod.default ?? mod.steps;

    if (typeof exported === 'function') {
      loaded.push(exported as Step<L, Ctx>);
    } else if (Array.isArray(exported) && exported.every((s) => typeof s === 'function')) {
      loaded.push(...(exported as Step<L, Ctx>[]));
    } else {
      throw new Error(
        `[loadSteps] Module "${p}" must default-export a Step or an array of Steps.`
      );
    }
  }

  return loaded;
}

export async function loadStepsFromDir<L, Ctx>(
  dir: string,
  options?: { pattern?: RegExp }
): Promise<ReadonlyArray<Step<L, Ctx>>> {
  const pattern = options?.pattern ?? /\.(ts|js|mjs|cjs)$/;
  const absDir = resolve(dir);
  const entries = await readdir(absDir, { withFileTypes: true });

  const paths = entries
    .filter((e) => e.isFile() && pattern.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name)) // deterministic order
    .map((e) => join(absDir, e.name));

  return loadSteps<L, Ctx>(paths);
}
```

### Contract for a dynamic step file

```typescript
// extensions/enrichContext.ts  — TypeScript, no compilation needed

import type { Step } from 'groucho-fp';
import type { AppError, AppContext } from '../types.js';

const enrichContext: Step<AppError, AppContext> = async (ctx) => {
  return Either.right({ ...ctx, enriched: true });
};

export default enrichContext;
```

Multiple steps in one file:

```typescript
// extensions/auditBundle.ts

export default [auditStart, auditEnd] satisfies Step<AppError, AppContext>[];
```

Named export alternative:

```typescript
export const steps = [auditStart, auditEnd];
```

### Integration with createPipeline

The caller controls the position of dynamic steps in the array:

```typescript
// Statically compiled steps
const staticSteps = [validateUserId, fetchUser];

// Dynamic steps loaded at runtime (TypeScript, no build step)
const dynamicSteps = await loadSteps<AppError, AppContext>([
  './extensions/enrichContext.ts',
  './extensions/auditLog.ts',
]);

// Or from a directory
const pluginSteps = await loadStepsFromDir<AppError, AppContext>('./plugins/');

// Caller decides the order: static first, then dynamic, or interleaved
const pipeline = createPipeline<AppError, AppContext>(
  [...staticSteps, ...dynamicSteps, ...pluginSteps, sendWelcomeEmail],
  options
);
```

---

## Consequences

### Positive

- **TypeScript step files with no compilation step**: authors write `.ts` files and drop them in the extensions directory; jiti handles the rest
- **Pipeline API unchanged**: `createPipeline` does not change — composition happens before it is called
- **Controlled position**: the caller decides where dynamic steps are inserted in the array
- **Determinism**: `loadStepsFromDir` sorts files alphabetically — predictable behaviour
- **Fail fast**: invalid exports throw at load time, before `run()` is ever called
- **Battle-tested loader**: jiti is used in production by Nuxt, Nitro, and pi-mono

### Negative / Trade-offs

- **Runtime dependency**: jiti must be present in `dependencies`; consumers of the library get it whether or not they use dynamic loading
- **No static type safety for loaded modules**: TypeScript cannot verify that a runtime-loaded file exports `Step<L, Ctx>`; the runtime check only verifies it is a function
- **No type-checking at runtime**: jiti transpiles, it does not type-check — type errors in dynamic step files surface at runtime as logic errors
- **`loadStepsFromDir` loads alphabetically**: if step order is semantically significant, the caller must use `loadSteps` with explicit paths

### Documented edge cases

- **File not found**: jiti throws `ERR_MODULE_NOT_FOUND` — propagated to the caller unchanged
- **Syntax error in step file**: jiti throws a parse/transform error — propagated to the caller
- **Directory scan returns zero files**: `loadStepsFromDir` returns `[]`; pipeline runs with static steps only
- **Module exports something other than a function**: `loadSteps` throws with an explicit message including the file path

---

## Alternatives considered

- **Native `await import()` (zero-dep, JS only)** — viable for compiled `.js`/`.mjs` step files; rejected as the primary approach because it requires step authors to maintain a separate compilation step, which defeats the plugin ergonomics goal. Remains available to consumers who prefer it.
- **`--experimental-transform-types` (Node 22.7+)** — handles full TypeScript via SWC bundled in Node, zero external deps; rejected because it is still experimental and places a hard constraint on the Node version and process launch flags for all library consumers.
- **tsx** — esbuild-based alternative to jiti; technically equivalent. Rejected in favour of jiti because jiti is the loader used by pi-mono (the reference implementation for this feature) and is proven across the Nuxt/Nitro ecosystem. Can be revisited if jiti's maintenance trajectory changes.
- **`vm.Module` (Node built-in)** — rejected: still experimental (`--experimental-vm-modules`), requires manual module resolution, no TypeScript support; complexity not justified.
- **Loading inside `run(ctx)`** — rejected: would make `run` impure in a non-obvious way; the "load first, then create pipeline" approach is more composable and testable.
- **Recursive `loadStepsFromDir`** — deferred: increases discovery complexity; the `index.ts` pattern (as in pi-mono) can be added in a future revision if the need arises.
