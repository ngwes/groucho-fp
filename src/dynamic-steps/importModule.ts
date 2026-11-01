import { access } from "node:fs/promises";
import { createJiti } from "jiti";
import { EitherAsync, TryAsync, left, toEither } from "@ngwes/mini-fp";
import type { LoadError } from "./LoadError.js";

const jiti = createJiti(import.meta.url);

/**
 * Imports the module at `path` (already absolute) through jiti, so TypeScript files load too.
 * Existence is checked first: a step that imports a missing dependency is `import-failed`, not `not-found`.
 * The exceptions are matched, never put in an Either as they are: a module may throw null, which a left
 * cannot hold. A module whose exports are null or undefined (`module.exports = null`) is `invalid-export`.
 */
export const importModule = (path: string): EitherAsync<LoadError, Record<string, unknown>> =>
    EitherAsync.from(TryAsync.runAsync(() => access(path)).match(
        () => TryAsync.runAsync(() => jiti.import<Record<string, unknown> | null | undefined>(path)).match(
            module => toEither<LoadError, Record<string, unknown>>(module, () => ({
                tag: "invalid-export",
                path,
                detail: `no steps or default export: the module exports ${String(module)}`,
            })),
            cause => left<LoadError, Record<string, unknown>>({ tag: "import-failed", path, cause }),
        ),
        cause => left<LoadError, Record<string, unknown>>({ tag: "not-found", path, cause }),
    ));
