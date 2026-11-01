import type { Either } from "@ngwes/mini-fp";

export type StepResult<E, Ctx> = Either<E, Ctx> | PromiseLike<Either<E, Ctx>>;

export type Step<E, Ctx> = (ctx: Readonly<Ctx>) => StepResult<E, Ctx>;

export interface PipelineOptions<E, Ctx extends object> {
    /** A step returned left(error). Optional: by default the error stops the pipeline. */
    onLeft?: (error: E, ctx: Readonly<Ctx>) => StepResult<E, Ctx>;
    /** A step threw or its promise rejected. */
    onException: (exception: unknown, ctx: Readonly<Ctx>) => StepResult<E, Ctx>;
    /** A step changed or removed a value an earlier step had written. */
    onConflictingKeys: (
        keys: ReadonlyArray<keyof Ctx & string>,
        ctx: Readonly<Ctx>,   // the context the step received
        next: Readonly<Ctx>,  // the context the step returned
    ) => StepResult<E, Ctx>;
}
