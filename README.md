# groucho-fp

A functional pipeline library for TypeScript built on top of [`@ngwes/mini-fp`](https://www.npmjs.com/package/@ngwes/mini-fp).

It provides two things:

- **`Pipeline`** — runs a sequence of steps over a shared context, with explicit hooks for errors, exceptions, and key conflicts.
- **`loadSteps` / `loadStepsFromDir`** — dynamically imports step files at runtime, so pipelines can be assembled from the filesystem without being statically wired at build time.

<!-- docs-site:skip-start -->
**Documentation:** <https://ngwes.github.io/groucho-fp/>
<!-- docs-site:skip-end -->

---

## Installation

```bash
npm install @ngwes/groucho-fp @ngwes/mini-fp
```

`@ngwes/mini-fp` is a peer dependency and must be installed alongside this package.

---

## Agent Skills

[`groucho-fp-skills`](https://github.com/ngwes/groucho-fp-skills) is a Claude Code plugin with skills that teach coding agents how to use this library: a router skill, reference skills for `Pipeline`, `Step` and `loadSteps` / `loadStepsFromDir`, and pattern skills for pipeline hooks, step composition and dynamic loading.

Install it from within Claude Code:

```text
/plugin marketplace add ngwes/groucho-fp-skills
/plugin install groucho-fp@groucho-fp-skills
```

See the [groucho-fp-skills README](https://github.com/ngwes/groucho-fp-skills#readme) for the other install options and for how to point your agent at the skills.

---

## Core concepts

### Context (`Ctx`)

A pipeline operates on a plain object called the **context**. Each step receives the current context (frozen, i.e. read-only) and returns a new context wrapped in an `Either`. Steps accumulate output by spreading the previous context and adding new keys.

```ts
type Ctx = {
  input: string;
  parsed?: number;
  validated?: boolean;
};
```

### Step

A `Step` is an async function that takes the current context and returns `Either<E, Ctx>`:

```ts
import type { Step } from "@ngwes/groucho-fp";
import { Either } from "@ngwes/mini-fp";

const parseStep: Step<string, Ctx> = async (ctx) => {
  const parsed = parseInt(ctx.input, 10);
  if (isNaN(parsed)) return Either.left("Not a number");
  return Either.right({ ...ctx, parsed });
};
```

- Return `Either.right(newCtx)` to continue.
- Return `Either.left(error)` to signal a handled failure.
- Throwing an exception triggers the `onException` hook.

### Either

`Either<L, R>` is the return type of every step. It is a discriminated union from `@ngwes/mini-fp`:

| Variant | Meaning |
|---------|---------|
| `Either.right(value)` | Success — pipeline continues with `value` as the new context |
| `Either.left(error)` | Failure — pipeline stops and calls `onLeft` |

---

## `Pipeline`

```ts
import { Pipeline } from "@ngwes/groucho-fp";

const result = await Pipeline(initialCtx, steps, options);
```

### Signature

```ts
function Pipeline<E, Ctx extends object>(
  ctx: Ctx,
  steps: ReadonlyArray<Step<E, Ctx>>,
  options: PipelineOptions<E, Ctx>
): Promise<Either<E, Readonly<Ctx>>>
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `ctx` | The initial context object. It is frozen before the first step runs. |
| `steps` | Ordered array of steps to execute sequentially. |
| `options` | Hooks for non-happy-path situations (see below). |

### `PipelineOptions`

```ts
interface PipelineOptions<E, Ctx extends object> {
  onLeft:           (err: E,       ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>;
  onException:      (ex: unknown,  ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>;
  onConflictingKeys:(keys: ReadonlyArray<string>, ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>;
}
```

| Hook | When it fires | What you can do |
|------|---------------|-----------------|
| `onLeft` | A step returned `Either.left(err)`. Receives the error and the context at that point. | Return `right` to recover and continue, or `left` to propagate the failure. |
| `onException` | A step threw an unhandled exception. Receives the thrown value and the last good context. | Return `right` to recover, or `left` to surface the error. |
| `onConflictingKeys` | A step returned a context that overwrites a key that already existed with a **different** value. Receives the list of conflicting key names. | Return `right` to accept the new context, or `left` to reject it. |

### Execution model

1. Steps run **sequentially** in array order.
2. The context passed to each step is **frozen** (`Object.freeze`). Steps must return a new object (`{ ...ctx, newKey: value }`).
3. If a step returns `Either.left`, subsequent steps are **skipped**; `onLeft` is called immediately.
4. If `onLeft` or `onConflictingKeys` returns `Either.left`, the pipeline stops at that point.
5. Exceptions are caught at the pipeline level; `onException` receives the last accumulated context.

### Minimal example

```ts
import { Pipeline } from "@ngwes/groucho-fp";
import { Either } from "@ngwes/mini-fp";
import type { Step, PipelineOptions } from "@ngwes/groucho-fp";

type Ctx = { input: string; result?: string };
type Err = { message: string };

const step1: Step<Err, Ctx> = async (ctx) =>
  Either.right({ ...ctx, result: ctx.input.toUpperCase() });

const options: PipelineOptions<Err, Ctx> = {
  onLeft:            async (err, ctx) => Either.left(err),
  onException:       async (ex, ctx)  => Either.left({ message: String(ex) }),
  onConflictingKeys: async (keys, ctx) => Either.left({ message: `Conflict on: ${keys.join(", ")}` }),
};

const result = await Pipeline({ input: "hello" }, [step1], options);

if (result.isRight()) {
  console.log(result.unwrapRight().result); // "HELLO"
}
```

---

## `loadSteps` and `loadStepsFromDir`

These functions dynamically load step files at runtime using [jiti](https://github.com/unjs/jiti), which supports TypeScript files without a prior build step.

### `loadSteps`

Loads steps from an explicit list of file paths.

```ts
import { loadSteps } from "@ngwes/groucho-fp";

const steps = await loadSteps<Err, Ctx>([
  "./steps/validate.ts",
  "./steps/transform.ts",
]);
```

Steps from each file are appended in the order the paths are provided.

### `loadStepsFromDir`

Scans a directory for step files and loads them in **alphabetical order** by filename.

```ts
import { loadStepsFromDir } from "@ngwes/groucho-fp";

const steps = await loadStepsFromDir<Err, Ctx>("./steps");

// With a custom file filter:
const steps = await loadStepsFromDir<Err, Ctx>("./steps", {
  pattern: /\.step\.(ts|js)$/,
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `pattern` | `/\.(ts\|js\|mjs\|cjs)$/` | Regex applied to filenames. Only matching files are loaded. |

Files are sorted alphabetically, so naming conventions like `01-validate.ts`, `02-transform.ts` give predictable ordering.

### Step file formats

A step file can export its steps in three ways:

**1. Default export — single function**

```ts
// validate.ts
import { Either } from "@ngwes/mini-fp";

export default async (ctx: Ctx) =>
  Either.right({ ...ctx, validated: true });
```

**2. Default export — array of functions**

```ts
// transforms.ts
import { Either } from "@ngwes/mini-fp";

const normalize = async (ctx: Ctx) => Either.right({ ...ctx, value: ctx.value.trim() });
const uppercase = async (ctx: Ctx) => Either.right({ ...ctx, value: ctx.value.toUpperCase() });

export default [normalize, uppercase];
```

**3. Named export `steps`**

```ts
// processors.ts
import { Either } from "@ngwes/mini-fp";

const step1 = async (ctx: Ctx) => Either.right({ ...ctx, a: 1 });
const step2 = async (ctx: Ctx) => Either.right({ ...ctx, b: 2 });

export const steps = [step1, step2];
```

Files that export none of the above are silently ignored (they contribute zero steps).

---

## Putting it together

```ts
import { Pipeline, loadStepsFromDir } from "@ngwes/groucho-fp";
import type { PipelineOptions } from "@ngwes/groucho-fp";

type Ctx  = { userId: string; profile?: Record<string, unknown> };
type Err  = { code: string; detail: string };

const options: PipelineOptions<Err, Ctx> = {
  onLeft: async (err, ctx) => {
    console.error("Pipeline failed:", err);
    return Either.left(err);
  },
  onException: async (ex, ctx) => {
    console.error("Unexpected exception:", ex);
    return Either.left({ code: "EXCEPTION", detail: String(ex) });
  },
  onConflictingKeys: async (keys, ctx) => {
    console.warn("Key conflict detected:", keys);
    return Either.left({ code: "CONFLICT", detail: keys.join(", ") });
  },
};

// Load all .ts/.js files from the steps/ directory, alphabetically
const steps = await loadStepsFromDir<Err, Ctx>("./steps");

const result = await Pipeline({ userId: "42" }, steps, options);

result.match(
  (ctx) => console.log("Done:", ctx),
  (err) => console.error("Final error:", err)
);
```

---

## API reference

### Types

```ts
type Step<E, Ctx> = (ctx: Readonly<Ctx>) => Promise<Either<E, Ctx>>;

type DynamicStepModule<L, Ctx> =
  | { default: Step<L, Ctx> }
  | { default: ReadonlyArray<Step<L, Ctx>> }
  | { steps: ReadonlyArray<Step<L, Ctx>> };

interface PipelineOptions<E, Ctx extends object> {
  onLeft:            (err: E,       ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>;
  onException:       (ex: unknown,  ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>;
  onConflictingKeys: (keys: ReadonlyArray<string>, ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>;
}
```

### Functions

| Function | Returns |
|----------|---------|
| `Pipeline(ctx, steps, options)` | `Promise<Either<E, Readonly<Ctx>>>` |
| `loadSteps(paths)` | `Promise<ReadonlyArray<Step<L, Ctx>>>` |
| `loadStepsFromDir(path, options?)` | `Promise<ReadonlyArray<Step<L, Ctx>>>` |

---

## Requirements

- Node.js >= 18
- `@ngwes/mini-fp` >= 1.4.0 (peer dependency)
