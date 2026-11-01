import { EitherAsync, TryAsync, Validate, foldAsync, left, right, sequenceValidate } from "@ngwes/mini-fp";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type Step } from "../pipeline/types.js";
import { constants } from "./dynamic-steps-constants.js";
import { importModule } from "./importModule.js";
import { type LoadError } from "./LoadError.js";
import { stepsOf } from "./stepsOf.js";

export type DynamicStepModule<E, Ctx> =
    | { default: Step<E, Ctx> }
    | { default: ReadonlyArray<Step<E, Ctx>> }
    | { steps: ReadonlyArray<Step<E, Ctx>> };

const loadFile = <E, Ctx>(path: string): Promise<Validate<LoadError, Step<E, Ctx>[]>> =>
    importModule(path)
        .bind(module => stepsOf<E, Ctx>(path, module))
        .match(
            steps => Validate.valid<LoadError, Step<E, Ctx>[]>(steps),
            error => Validate.invalid<LoadError, Step<E, Ctx>[]>([error]),
        );

/**
 * Loads the steps exported by each file, in path order. Relative paths resolve against the working directory.
 * Every file is attempted: if any fail, the result is left with all the failures, in path order.
 */
export const loadSteps = <E, Ctx>(
    paths: ReadonlyArray<string>,
): EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>> =>
    EitherAsync.from(
        foldAsync(
            paths.map(path => resolve(path)),
            [] as Validate<LoadError, Step<E, Ctx>[]>[],
            async (loaded, path) => [...loaded, await loadFile<E, Ctx>(path)],
        ).then(loaded => sequenceValidate(loaded).match(
            stepLists => right<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>>(stepLists.flat()),
            errors => left<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>>(errors),
        )),
    );

/**
 * Loads the steps from the files of a directory, ordered by name. Only files matching `pattern` are loaded;
 * by default, .ts/.js/.mjs/.cjs files other than declaration (.d.ts), test (.test.*) and spec (.spec.*) files.
 */
export const loadStepsFromDir = <E, Ctx>(
    dir: string,
    options?: { pattern?: RegExp },
): EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step<E, Ctx>>> => {
    const pattern = options?.pattern ?? constants.filePatterns;
    const absolute = resolve(dir);

    return TryAsync.runAsync(() => readdir(absolute, { withFileTypes: true })).toEither()
        .mapLeft<ReadonlyArray<LoadError>>(cause => [{ tag: "not-found", path: absolute, cause }])
        .map(entries => entries
            .filter(entry => entry.isFile() && pattern.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b))
            .map(name => join(absolute, name)))
        .bindAsync(loadSteps<E, Ctx>);
};
