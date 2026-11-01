# groucho-fp

Typed, functional pipelines for TypeScript, built on [`@ngwes/mini-fp`](https://www.npmjs.com/package/@ngwes/mini-fp).

It provides two things:

- **`Pipeline`** runs a list of steps over a shared context. Each step returns an `Either`. When a step fails, throws or overwrites a value, a hook decides whether the pipeline recovers and continues, or stops.
- **`loadSteps` / `loadStepsFromDir`** import step files at runtime (TypeScript included, no build step), so a pipeline can be assembled from the filesystem. Files that cannot be loaded come back as typed errors, not exceptions.

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

### Context

A pipeline works on one plain object, the **context**. Each step reads the current context and returns a new one with its own results added. Declare everything the steps will write as optional fields, with no default value:

```ts
type Ctx = {
  input: string;     // given by the caller
  parsed?: number;   // written by the parse step
  doubled?: number;  // written by the double step
};
```

The pipeline freezes a shallow copy of the context it starts with (your object is not frozen) and of every context a step returns. So a step cannot change the context it receives: it spreads it into a new object (`{ ...ctx, parsed }`).

Use plain objects, not class instances: the copy keeps the object's own fields, not its prototype, so methods and getters are lost.

### Step

A `Step<E, Ctx>` is a function that takes the current context and returns an `Either<E, Ctx>`, sync or async:

```ts
import { left, right } from "@ngwes/mini-fp";
import type { Step } from "@ngwes/groucho-fp";

type Ctx = { input: string; parsed?: number; doubled?: number };

const parse: Step<string, Ctx> = (ctx) => {
  const parsed = Number.parseInt(ctx.input, 10);
  return Number.isNaN(parsed) ? left(`"${ctx.input}" is not a number`) : right({ ...ctx, parsed });
};

const double: Step<string, Ctx> = async (ctx) => right({ ...ctx, doubled: (ctx.parsed ?? 0) * 2 });
```

- Return `right(newCtx)` to continue with the next step.
- Return `left(error)` for a failure you expect. The `onLeft` hook decides what happens next.
- Throwing, or returning a promise that rejects, is an exception. The `onException` hook decides what happens next.

A step always returns a context, even when it adds nothing (`right(ctx)`). mini-fp 2 does not allow an empty `Either`: `right(undefined)` and `left(undefined)` throw.

### `StepResult`

`StepResult<E, Ctx>` is what a step, or a hook, may return: an `Either<E, Ctx>`, or anything you can `await` to get one. That covers a plain `Either`, a `Promise<Either>` (an `async` function) and a mini-fp `EitherAsync`:

```ts
import { EitherAsync, Option, right } from "@ngwes/mini-fp";
import type { Step } from "@ngwes/groucho-fp";

type User = { id: string; name: string };
type Ctx = { userId: string; user?: User; greeting?: string };
type Err = { tag: "user-not-found"; userId: string };

declare const db: { findUser(id: string): Promise<User | undefined> };

// returns an Either
const greet: Step<Err, Ctx> = (ctx) => right({ ...ctx, greeting: `Hello, ${ctx.user?.name}` });

// returns an EitherAsync: no async/await needed
const fetchUser: Step<Err, Ctx> = (ctx) =>
  Option.fromAsync(db.findUser(ctx.userId))
    .toEither<Err>({ tag: "user-not-found", userId: ctx.userId })
    .map((user) => ({ ...ctx, user }));

// returns an EitherAsync built directly
const noop: Step<Err, Ctx> = (ctx) => EitherAsync.right(ctx);
```

---

## `Pipeline`

### Signature

```ts skip
function Pipeline<E, Ctx extends object>(
  ctx: Ctx,
  steps: ReadonlyArray<Step<E, Ctx>>,
  options: PipelineOptions<E, Ctx>,
): EitherAsync<E, Readonly<Ctx>>;
```

| Parameter | Description |
|-----------|-------------|
| `ctx` | The initial context. The pipeline works on a frozen copy of it. |
| `steps` | The steps, run one after the other in array order. |
| `options` | The hooks: `onLeft` (optional), `onException` and `onConflictingKeys`. See [Hooks](#hooks). |

### Execution model

1. The pipeline freezes a shallow copy of `ctx`. That is the current context.
2. Each step receives the current context. Depending on what it returns:
   - `right(next)`: if `next` changed or removed a value that was already written, `onConflictingKeys` runs. Otherwise a frozen copy of `next` becomes the current context.
   - `left(error)`: `onLeft` runs. Without `onLeft`, the pipeline stops with `left(error)`.
   - it throws, or its promise rejects: `onException` runs.
3. A hook that returns `right(ctx)` makes the pipeline **continue with the next step**, using that context. A hook that returns `left(error)` **stops** the pipeline: later steps do not run and the result is that `left`.
4. After the last step the result is `right` of the current context. With no steps it is `right` of the copy of `ctx`, and no hook runs.

### The result is an `EitherAsync`

`Pipeline` returns a mini-fp `EitherAsync<E, Readonly<Ctx>>`. You can `await` it to get the `Either`, or keep chaining (`map`, `mapLeft`, `onLeft`, `match`, ...) before awaiting:

```ts
import { left, right } from "@ngwes/mini-fp";
import { Pipeline } from "@ngwes/groucho-fp";
import type { PipelineOptions, Step } from "@ngwes/groucho-fp";

type Ctx = { input: string; shout?: string };
type Err = { message: string };

const shout: Step<Err, Ctx> = (ctx) => right({ ...ctx, shout: ctx.input.toUpperCase() });

const options: PipelineOptions<Err, Ctx> = {
  onException: (exception) => left({ message: `crashed: ${String(exception)}` }),
  onConflictingKeys: (keys) => left({ message: `conflict on ${keys.join(", ")}` }),
};

// await it: an Either
const result = await Pipeline({ input: "hello" }, [shout], options);
console.log(result.isRight()); // true

// or chain first
const message = await Pipeline({ input: "hello" }, [shout], options)
  .map((ctx) => ctx.shout)
  .onLeft((error) => console.error(error.message))
  .match(
    (shouted) => `got ${shouted}`,
    (error) => `failed: ${error.message}`,
  );
console.log(message); // "got HELLO"
```

`onLeft` is left out here, so a step's `left` would stop the pipeline as is. The next section explains the hooks.

---

## Hooks

### What a hook is

A hook is a function in `PipelineOptions` that the pipeline calls when a step does not simply succeed. There are three situations, and one hook for each:

| Hook | When it runs | It receives |
|------|--------------|-------------|
| `onLeft` (optional) | A step returned `left(error)`. | The error, and the context the step received. |
| `onException` | A step threw, or its promise rejected. | The thrown value, and the context the step received. |
| `onConflictingKeys` | A step returned a context that changed or removed a value an earlier step had written. | The keys, the context the step received, and the context it returned. |

Every hook follows the same rule, and returns a `StepResult` like a step does:

- **`right(ctx)`: recover.** The pipeline continues with the next step, using `ctx` as the current context.
- **`left(error)`: stop.** Later steps do not run, and the pipeline's result is `left(error)`.

Without `onLeft`, a step's `left` stops the pipeline unchanged. `onException` and `onConflictingKeys` are required.

### Example: recover with a default

`loadAvatar` fails when the user has no avatar. That should not stop the page from rendering, so `onLeft` puts a default avatar in the context and the pipeline continues with `render`. Any other error stops the pipeline:

```ts
import { Option, left, right } from "@ngwes/mini-fp";
import { Pipeline } from "@ngwes/groucho-fp";
import type { PipelineOptions, Step } from "@ngwes/groucho-fp";

type User = { id: string; name: string };
type Ctx = { userId: string; user?: User; avatarUrl?: string; html?: string };
type Err =
  | { tag: "user-not-found"; userId: string }
  | { tag: "no-avatar"; userId: string }
  | { tag: "crash"; cause: unknown }
  | { tag: "conflict"; keys: ReadonlyArray<string> };

declare const db: {
  findUser(id: string): Promise<User | undefined>;
  findAvatarUrl(userId: string): Promise<string | undefined>;
};

const fetchUser: Step<Err, Ctx> = (ctx) =>
  Option.fromAsync(db.findUser(ctx.userId))
    .toEither<Err>({ tag: "user-not-found", userId: ctx.userId })
    .map((user) => ({ ...ctx, user }));

const loadAvatar: Step<Err, Ctx> = (ctx) =>
  Option.fromAsync(db.findAvatarUrl(ctx.userId))
    .toEither<Err>({ tag: "no-avatar", userId: ctx.userId })
    .map((avatarUrl) => ({ ...ctx, avatarUrl }));

const render: Step<Err, Ctx> = (ctx) =>
  right({ ...ctx, html: `<img src="${ctx.avatarUrl}"> ${ctx.user?.name}` });

const options: PipelineOptions<Err, Ctx> = {
  onLeft: (error, ctx) =>
    error.tag === "no-avatar"
      ? right({ ...ctx, avatarUrl: "/img/default-avatar.png" }) // recover: render runs next
      : left(error),                                            // stop
  onException: (exception) => left({ tag: "crash", cause: exception }),
  onConflictingKeys: (keys) => left({ tag: "conflict", keys }),
};

const page = await Pipeline({ userId: "42" }, [fetchUser, loadAvatar, render], options)
  .match(
    (ctx) => ctx.html ?? "",
    (error) => `error: ${error.tag}`,
  );
```

### Things to know about hooks

- **A hook's context is trusted.** The context a hook returns is not checked for conflicts: the hook has the last word. It does get frozen, like any other context.
- **A hook that throws rejects the result.** If a hook throws, or its promise rejects, the pipeline does not call another hook: the `EitherAsync` it returned rejects with that error, and `await` throws it. Keep hooks simple, or catch inside them.
- **A `left` needs a value.** In mini-fp 2, `left(undefined)` throws. A step can throw `undefined` or reject with no reason, so in `onException` wrap the exception in your error type (`left({ tag: "crash", cause: exception })`) rather than passing it on as is.
- **Cleanup goes in the hooks.** The pipeline has no rollback of its own. If a step opened a transaction, roll it back in the hook that stops the pipeline.

### Conflicting keys

A step adds to the context; it should not change what an earlier step wrote. After each step, the pipeline compares the context the step received with the one it returned. A key **conflicts** when it held a value (anything but `undefined`) and the returned context:

- holds a different value for it, compared with `!==`, or
- does not have the key any more (the step dropped it).

Writing a key that was `undefined` is not a conflict: that is how a step adds its output. Three consequences:

- **Initialise step outputs as `undefined`.** Declare them as optional fields and leave them out of the initial context. A field that starts as `""`, `0`, `false` or `null` already counts as written, so the step that fills it is reported as a conflict.
- **`null` is a value.** A step that writes `null` has written the key; a later step that changes it conflicts.
- **Objects are compared by reference.** A step that returns a new object with the same content in an existing key (`{ ...ctx, user: { ...ctx.user } }`) conflicts. Keep the reference you received.

`onConflictingKeys` receives the conflicting keys, the context the step received (`ctx`) and the context it returned (`next`). Return `right(next)` to accept the step's output, `right(ctx)` to keep the previous context and move on, or `left(...)` to stop:

```ts
import { left, right } from "@ngwes/mini-fp";
import type { PipelineOptions } from "@ngwes/groucho-fp";

type Ctx = { orderId: string; total?: number; updatedAt?: Date };
type Err = { tag: "conflict"; keys: ReadonlyArray<string> } | { tag: "crash"; cause: unknown };

const options: PipelineOptions<Err, Ctx> = {
  onException: (exception) => left({ tag: "crash", cause: exception }),
  // updatedAt may be rewritten by any step; any other overwrite is a bug
  onConflictingKeys: (keys, ctx, next) =>
    keys.every((key) => key === "updatedAt") ? right(next) : left({ tag: "conflict", keys }),
};
```

The keys are typed `keyof Ctx & string`, so a typo in the comparison above does not compile.

---

## `loadSteps` and `loadStepsFromDir`

These functions import step files at runtime with [jiti](https://github.com/unjs/jiti), so a step file can be TypeScript with no build step. They do not throw: both return an `EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>>`, with the steps on the right, or on the left every file that could not be loaded.

### `loadSteps`

Loads the steps of a list of files. Relative paths are resolved against the working directory. The steps keep the order of the paths, then the order inside each file.

```ts
import { loadSteps } from "@ngwes/groucho-fp";

type Ctx = { input: string; validated?: boolean };
type Err = { message: string };

const steps = await loadSteps<Err, Ctx>(["./steps/validate.ts", "./steps/transform.ts"]);
```

### `loadStepsFromDir`

Loads the step files of a directory (not its sub-directories), in alphabetical order of file name. Prefix the names (`01-validate.ts`, `02-transform.ts`) when the order matters.

```ts
import { loadStepsFromDir } from "@ngwes/groucho-fp";

type Ctx = { input: string; validated?: boolean };
type Err = { message: string };

const steps = await loadStepsFromDir<Err, Ctx>("./steps");

// only the files whose name matches the pattern
const tagged = await loadStepsFromDir<Err, Ctx>("./steps", { pattern: /\.step\.ts$/ });
```

| Option | Default | Description |
|--------|---------|-------------|
| `pattern` | `.ts`, `.js`, `.mjs` and `.cjs` files, except `.d.ts`, `.test.*` and `.spec.*` files | A regular expression tested against each file name. Only matching files are loaded. |

**A steps folder holds only step files.** Every file the pattern matches must export steps; a helper module or a type-only file in the folder is reported as an `invalid-export` error and the whole load is a `left`. Keep shared code outside the folder, or pass a `pattern` that only matches the step files.

### Step file formats

A step file exports its steps in one of three ways. If it has a `steps` export, that one is used; otherwise the `default` export.

**1. Default export: one step**

```ts
// steps/01-validate.ts
import { left, right } from "@ngwes/mini-fp";
import type { Step } from "@ngwes/groucho-fp";

type Ctx = { input: string; validated?: boolean };
type Err = { message: string };

const validate: Step<Err, Ctx> = (ctx) =>
  ctx.input.length > 0 ? right({ ...ctx, validated: true }) : left({ message: "input is empty" });

export default validate;
```

**2. Default export: an array of steps**

```ts
// steps/02-transforms.ts
import { right } from "@ngwes/mini-fp";
import type { Step } from "@ngwes/groucho-fp";

type Ctx = { input: string; trimmed?: string; upper?: string };
type Err = { message: string };

const trim: Step<Err, Ctx> = (ctx) => right({ ...ctx, trimmed: ctx.input.trim() });
const upper: Step<Err, Ctx> = (ctx) => right({ ...ctx, upper: (ctx.trimmed ?? "").toUpperCase() });

export default [trim, upper];
```

**3. Named export `steps`**

```ts
// steps/03-audit.ts
import { right } from "@ngwes/mini-fp";
import type { Step } from "@ngwes/groucho-fp";

type Ctx = { input: string; auditedAt?: Date };
type Err = { message: string };

export const steps: ReadonlyArray<Step<Err, Ctx>> = [
  (ctx) => right({ ...ctx, auditedAt: new Date() }),
];
```

An empty array is valid and adds no steps. Anything else, such as a module with neither export, an object, or an array holding something that is not a function, is an `invalid-export` error.

The `DynamicStepModule<E, Ctx>` type describes these three shapes. The loader only checks at runtime that the steps are functions: it cannot check their types.

### Load errors

Each file that cannot be loaded gives one `LoadError`. Every file is attempted, so a `left` lists all the failures, in file order. `path` is always absolute.

| `tag` | Meaning | Extra field |
|-------|---------|-------------|
| `not-found` | The file, or the directory given to `loadStepsFromDir`, does not exist. | `cause` |
| `import-failed` | The file exists but importing it failed: a syntax error, a module that throws when imported, a missing dependency. | `cause` |
| `invalid-export` | The file imported fine but has no usable `steps` or `default` export. | `detail` |

Handle them with `match`, or turn them into your own error type with `mapLeft`:

```ts
import { loadStepsFromDir } from "@ngwes/groucho-fp";
import type { LoadError, Step } from "@ngwes/groucho-fp";

type Ctx = { input: string };
type Err = { message: string };

const describeLoadError = (error: LoadError): string => {
  switch (error.tag) {
    case "not-found":
      return `${error.path}: not found`;
    case "import-failed":
      return `${error.path}: could not be imported (${String(error.cause)})`;
    case "invalid-export":
      return `${error.path}: ${error.detail}`;
  }
};

const steps: ReadonlyArray<Step<Err, Ctx>> = await loadStepsFromDir<Err, Ctx>("./steps").match(
  (loaded) => loaded,
  (errors) => {
    throw new Error(`cannot load the steps:\n${errors.map(describeLoadError).join("\n")}`);
  },
);
```

---

## Putting it together

Load the steps from a folder, then run them. `bindAsync` runs the pipeline only if the steps loaded, and `mapLeft` turns the load errors into the pipeline's error type, so the whole flow is one `EitherAsync`:

```ts
import { left, right } from "@ngwes/mini-fp";
import { Pipeline, loadStepsFromDir } from "@ngwes/groucho-fp";
import type { LoadError, PipelineOptions } from "@ngwes/groucho-fp";

type Ctx = { userId: string; profile?: Record<string, unknown>; welcomed?: boolean };
type Err =
  | { tag: "load-failed"; errors: ReadonlyArray<LoadError> }
  | { tag: "not-found"; userId: string }
  | { tag: "crash"; cause: unknown }
  | { tag: "conflict"; keys: ReadonlyArray<string> };

const options: PipelineOptions<Err, Ctx> = {
  onLeft: (error, ctx) => {
    console.warn(`user ${ctx.userId}: ${error.tag}`);
    return left(error);
  },
  onException: (exception) => left({ tag: "crash", cause: exception }),
  onConflictingKeys: (keys, ctx, next) =>
    keys.length === 1 && keys[0] === "profile" ? right(next) : left({ tag: "conflict", keys }),
};

const outcome = await loadStepsFromDir<Err, Ctx>("./steps")
  .mapLeft((errors): Err => ({ tag: "load-failed", errors }))
  .bindAsync((steps) => Pipeline({ userId: "42" }, steps, options))
  .match(
    (ctx) => `done: ${JSON.stringify(ctx)}`,
    (error) => `failed: ${error.tag}`,
  );

console.log(outcome);
```

---

## API reference

### Types

```ts skip
import type { Either, EitherAsync } from "@ngwes/mini-fp";

/** What a step or a hook may return: an Either, or anything that resolves to one. */
type StepResult<E, Ctx> = Either<E, Ctx> | PromiseLike<Either<E, Ctx>>;

type Step<E, Ctx> = (ctx: Readonly<Ctx>) => StepResult<E, Ctx>;

interface PipelineOptions<E, Ctx extends object> {
  /** A step returned left(error). Optional: by default the error stops the pipeline. */
  onLeft?: (error: E, ctx: Readonly<Ctx>) => StepResult<E, Ctx>;
  /** A step threw or its promise rejected. */
  onException: (exception: unknown, ctx: Readonly<Ctx>) => StepResult<E, Ctx>;
  /** A step changed or removed a value an earlier step had written. */
  onConflictingKeys: (
    keys: ReadonlyArray<keyof Ctx & string>,
    ctx: Readonly<Ctx>,  // the context the step received
    next: Readonly<Ctx>, // the context the step returned
  ) => StepResult<E, Ctx>;
}

type DynamicStepModule<E, Ctx> =
  | { default: Step<E, Ctx> }
  | { default: ReadonlyArray<Step<E, Ctx>> }
  | { steps: ReadonlyArray<Step<E, Ctx>> };

type LoadError =
  | { tag: "not-found"; path: string; cause: unknown }
  | { tag: "import-failed"; path: string; cause: unknown }
  | { tag: "invalid-export"; path: string; detail: string };
```

### Functions

| Function | Returns |
|----------|---------|
| `Pipeline(ctx, steps, options)` | `EitherAsync<E, Readonly<Ctx>>` |
| `loadSteps<E, Ctx>(paths)` | `EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>>` |
| `loadStepsFromDir<E, Ctx>(dir, options?)` | `EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>>` |

The package exports `Pipeline`, `loadSteps` and `loadStepsFromDir`, and the types `Step`, `StepResult`, `PipelineOptions`, `DynamicStepModule` and `LoadError`.

---

## Migrating from 1.x

- **mini-fp 2.** `@ngwes/mini-fp` 2.0.0 or later is the required peer dependency. See its changelog for its own changes (prelude `right` / `left`, lazy `Try`).
- **`Pipeline` returns an `EitherAsync`**, not a native `Promise`. `await Pipeline(...)` still gives an `Either`; code that called `.then` / `.catch` on the result should `await` it or chain `match` / `map` instead.
- **Steps and hooks may return an `Either`, a promise of one, or an `EitherAsync`** (the new `StepResult` type). Existing `async` steps and hooks keep working; they no longer need to be `async`.
- **`onLeft` is optional.** Without it, a step's `left` stops the pipeline unchanged. A 1.x `onLeft: async (err) => Either.left(err)` can be removed.
- **A hook returning `right` continues with the next step, for every hook, `onException` included.** In 1.x, `onException` returning `right` ended the pipeline with that context. To stop, return `left`.
- **`onConflictingKeys` receives `(keys, ctx, next)`**: `next` is the context the step returned, so the hook can accept it with `right(next)`. The keys are typed `keyof Ctx & string`.
- **The initial context is copied before it is frozen.** 1.x froze the object you passed in. Contexts must be plain objects: a class instance loses its prototype in the copy.
- **Dropped keys count as conflicts.** A step that returns a context without a key that held a value now triggers `onConflictingKeys`.
- **`loadSteps` and `loadStepsFromDir` return `EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step>>`** instead of throwing. Replace `try { await loadSteps(...) }` with `match` or `mapLeft` on the result (see [Load errors](#load-errors)).
- **A module without a usable `steps` or `default` export is an `invalid-export` error**, instead of being skipped silently. So is an array export holding something that is not a function.
- **The default `loadStepsFromDir` pattern skips `.d.ts`, `.test.*` and `.spec.*` files.**
- **The loaders' type parameter is named `E`**, like the pipeline's (it was `L`). This only matters if you referred to it by name.

---

## Requirements

- Node.js >= 18
- `@ngwes/mini-fp` >= 2.0.0 (peer dependency)
