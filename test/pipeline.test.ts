import { describe, expect, it } from "vitest";
import { Pipeline, Step, PipelineOptions } from "../src";
import { Either, asTask } from "@ngwes/mini-fp";

describe("Pipeline", () => {
    it("runs only normal step when no error", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<Error, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<Error, StepCtx>({ ...ctx, step1output: ctx.input }))
        }
        const options : PipelineOptions<Error, StepCtx> = {
            onLeft: (err: Error, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().step1output).toBe("Hello world");
    })

    it("runs onLeft step when error", async () => {
        const step1: Step<Error, StepCtx> = (ctx: StepCtx) => {
            return asTask(Either.left<Error, StepCtx>(new Error("error message")))
        }
        const context = new StepCtx("Hello world")
        const options : PipelineOptions<Error, StepCtx> = {
            onLeft: (err: Error, ctx: StepCtx) => asTask(Either.right<Error, StepCtx>({...ctx, errorStepOutput: err.errorMessage})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().errorStepOutput).toBe("error message");
    })

    it("runs onConflictingKeys step when conflicting keys", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<Error, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<Error, StepCtx>({ ...ctx, step1output: "first" }))
        }
        const step2: Step<Error, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<Error, StepCtx>({ ...ctx, step1output: "second" }))
        }
        
        const options : PipelineOptions<Error, StepCtx> = {
            onLeft: (err: Error, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.left<Error, StepCtx>(new Error(`keys: ${keys}`))),
        }

        const result = await Pipeline(context, [step1, step2], options)

        expect(result.isLeft()).toBe(true);
        expect(result.unwrapLeft().errorMessage).toBe("keys: step1output");
    })
});

class Error {
    constructor(public errorMessage: string) { }
}

class StepCtx {
    public step1output?: string;
    public errorStepOutput?: string;
    public conflictingKeysStepOutput?: string;

    constructor(public input: string) {

    }
}