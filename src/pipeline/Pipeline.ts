import { EitherAsync, TryAsync, foldAsync, left, right } from "@ngwes/mini-fp";
import { conflictingKeys } from "./conflicts.js";
import { freezeCopy } from "./context.js";
import type { PipelineOptions, Step, StepResult } from "./types.js";

/**
 * Runs `steps` in order over a frozen copy of `ctx`. A step's left, exception or
 * conflicting keys go to the matching hook: a hook's right continues with the next
 * step, its left stops the pipeline. A hook that throws or rejects rejects the result.
 */
export function Pipeline<E, Ctx extends object>(
    ctx: Ctx,
    steps: ReadonlyArray<Step<E, Ctx>>,
    options: PipelineOptions<E, Ctx>,
): EitherAsync<E, Readonly<Ctx>> {
    return EitherAsync.from(foldAsync(
        [...steps],
        right<E, Readonly<Ctx>>(freezeCopy(ctx)),
        (acc, step) => acc.bindAsync(current => runStep(step, current, options)),
    ));
}

const runStep = <E, Ctx extends object>(
    step: Step<E, Ctx>,
    current: Readonly<Ctx>,
    options: PipelineOptions<E, Ctx>,
): EitherAsync<E, Readonly<Ctx>> =>
    EitherAsync.from(
        // Only the step runs inside the TryAsync: `match` calls the hooks after it, so a throwing or
        // rejecting hook rejects the pipeline. The exception goes to onException as is, never into a
        // left: a step may throw undefined, which a left cannot hold.
        TryAsync.runAsync(async () => step(current)).match(
            outcome => outcome.match<StepResult<E, Ctx>>(
                next => conflictingKeys(current, next).match(
                    keys => options.onConflictingKeys(keys, current, next),
                    () => right(next),
                ),
                error => options.onLeft?.(error, current) ?? left(error),
            ),
            exception => options.onException(exception, current),
        ),
    ).map(freezeCopy);
