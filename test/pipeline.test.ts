import { describe, expect, it } from "vitest";
import { Pipeline, Step, PipelineOptions } from "../src";
import { Either, asTask } from "@ngwes/mini-fp";

describe("Pipeline", () => {
    it("runs only", async () => {
        const step1: Step<Error, StepCtx> = (ctx: StepCtx) => {
            return asTask(Either.right<Error, StepCtx>({ ...ctx, step1output: "step1" }))
        }
        const context = new StepCtx("Hello world")
        const options : PipelineOptions<Error, StepCtx> = {
            onLeft: (err: Error, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isRight()).toBe(true);
    })
});

class Error {
    constructor(errorMessage: string) { }
}

class StepCtx {
    constructor(input: string) {
    }
}