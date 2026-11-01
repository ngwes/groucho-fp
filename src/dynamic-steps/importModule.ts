import { access } from "node:fs/promises";
import { createJiti } from "jiti";
import { TryAsync, type EitherAsync } from "@ngwes/mini-fp";
import type { LoadError } from "./LoadError.js";

const jiti = createJiti(import.meta.url);

/**
 * Imports the module at `path` (already absolute) through jiti, so TypeScript files load too.
 * Existence is checked first: a step that imports a missing dependency is `import-failed`, not `not-found`.
 * (A right cannot hold undefined, and `access` resolves to it: the existing path is carried along instead.)
 */
export const importModule = (path: string): EitherAsync<LoadError, Record<string, unknown>> =>
    TryAsync.runAsync(() => access(path).then(() => path)).toEither()
        .mapLeft<LoadError>(cause => ({ tag: "not-found", path, cause }))
        .bindAsync(existing =>
            TryAsync.runAsync(() => jiti.import<Record<string, unknown>>(existing)).toEither()
                .mapLeft<LoadError>(cause => ({ tag: "import-failed", path, cause })));
