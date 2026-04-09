import { describe, expect, it } from "vitest";
import { Pipeline, Step, PipelineOptions } from "../src";
import { Either, asTask } from "@ngwes/mini-fp";

describe("Pipeline", () => {
    it("runs only normal step when no error", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: ctx.input }))
        }
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().step1output).toBe("Hello world");
    })

    it("runs onLeft step when error", async () => {
        const step1: Step<StepError, StepCtx> = (ctx: StepCtx) => {
            return asTask(Either.left<StepError, StepCtx>(new StepError("error message")))
        }
        const context = new StepCtx("Hello world")
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, errorStepOutput: err.errorMessage})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().errorStepOutput).toBe("error message");
    })

    it("runs onConflictingKeys step when conflicting keys", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: "first" }))
        }
        const step2: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: "second" }))
        }
        
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.left<StepError, StepCtx>(new StepError(`keys: ${keys}`))),
        }

        const result = await Pipeline(context, [step1, step2], options)

        expect(result.isLeft()).toBe(true);
        expect(result.unwrapLeft().errorMessage).toBe("keys: step1output");
    })

    it("runs onException step when error", async () => {
        const step1: Step<StepError, StepCtx> = (ctx: StepCtx) => {
            throw new Error("exception message");
        }

        const context = new StepCtx("Hello world")
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, errorStepOutput: err.errorMessage})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, exceptionStepOutput: (err as Error).message})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().exceptionStepOutput).toBe("exception message");
    })

    it("runs onException step when error with value coming from the first step", async () => {
        const step2: Step<StepError, StepCtx> = (ctx: StepCtx) => {
            throw new Error("exception message");
        }

        const step1: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: "first" }))
        }

        const context = new StepCtx("Hello world")
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, errorStepOutput: err.errorMessage})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, exceptionStepOutput: ctx.step1output})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1, step2], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().exceptionStepOutput).toBe("first");
    })

    it("runs nothing  when no steps provider", async () => {
        
        const context = new StepCtx("Hello world")
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, errorStepOutput: err.errorMessage})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, exceptionStepOutput: ctx.step1output})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [], options)

        expect(result.isRight()).toBe(true);
        const resultContext = result.unwrapRight();
        expect(resultContext.step1output).toBeUndefined();
        expect(resultContext.errorStepOutput).toBeUndefined();
        expect(resultContext.conflictingKeysStepOutput).toBeUndefined();
        expect(resultContext.exceptionStepOutput).toBeUndefined();
    })

    it("runs onLeft step that return a left when error", async () => {
        const step1: Step<StepError, StepCtx> = (ctx: StepCtx) => {
            return asTask(Either.left<StepError, StepCtx>(new StepError("error message")))
        }
        const context = new StepCtx("Hello world")
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.left<StepError, StepCtx>(err)),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1], options)

        expect(result.isLeft()).toBe(true);
        expect(result.unwrapLeft().errorMessage).toBe("error message");
    })

    it("runs onConflictingKeys step when conflicting keys with right response", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: "first" }))
        }
        const step2: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: "second" }))
        }
        
        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right<StepError, StepCtx>({...ctx, step1output: "conflictingKeys"}))
        }

        const result = await Pipeline(context, [step1, step2], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().step1output).toBe("conflictingKeys");
    })

    it("runs steps and accumulate context when no error", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step1output: ctx.input }))
        }

        const step2: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step2output: ctx.input +" "+ ctx.step1output }))
        }

        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.right({...ctx, errorStepOutput: "error"})),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1, step2], options)

        expect(result.isRight()).toBe(true);
        expect(result.unwrapRight().step1output).toBe("Hello world");
        expect(result.unwrapRight().step2output).toBe("Hello world Hello world");
    })

    it("runs only steps before error", async () => {
        const context = new StepCtx("Hello world")
        const step1: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            return asTask(Either.left<StepError, StepCtx>(new StepError("step 1 error")))
        }

        let step2Executed:boolean = false;
        const step2: Step<StepError, Readonly<StepCtx>> = (ctx: StepCtx) => {
            step2Executed = true;
            return asTask(Either.right<StepError, StepCtx>({ ...ctx, step2output: ctx.input }))
        }

        const options : PipelineOptions<StepError, StepCtx> = {
            onLeft: (err: StepError, ctx: StepCtx) => asTask(Either.left(err)),
            onException: (err: unknown, ctx: StepCtx) => asTask(Either.right({...ctx, exceptionStepOutput: "exception"})),
            onConflictingKeys: (keys: readonly string[] , ctx: StepCtx) => asTask(Either.right({...ctx, conflictingKeysStepOutput: "keys"})),
        }

        const result = await Pipeline(context, [step1, step2], options)

        expect(result.isLeft()).toBe(true);
        expect(result.unwrapLeft().errorMessage).toBe("step 1 error");
        expect(step2Executed).toBe(false);
    })
});

class StepError {
    constructor(public errorMessage: string) { }
}

class StepCtx {
    public step1output?: string;
    public step2output?: string;
    public errorStepOutput?: string;
    public conflictingKeysStepOutput?: string;
    public exceptionStepOutput?: string;

    constructor(public input: string) {

    }
}