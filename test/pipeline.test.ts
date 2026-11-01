import { describe, expect, it, vi } from "vitest";
import { EitherAsync, left, right } from "@ngwes/mini-fp";
import { Pipeline } from "../src/index.js";
import type { PipelineOptions, Step } from "../src/index.js";

type Ctx = { input: string; a?: string | null; b?: string; fixed?: string; u?: { id: number } };
type Err = { tag: string };

const options = (overrides: Partial<PipelineOptions<Err, Ctx>> = {}): PipelineOptions<Err, Ctx> => ({
    onException: () => left({ tag: "crash" }),
    onConflictingKeys: () => left({ tag: "conflict" }),
    ...overrides,
});

const start = (): Ctx => ({ input: "x" });

const setA: Step<Err, Ctx> = ctx => right({ ...ctx, a: `${ctx.input}1` });
const setB: Step<Err, Ctx> = ctx => right({ ...ctx, b: `${ctx.a}2` });

describe("Pipeline", () => {
    it("runs the steps in order and accumulates the context", async () => {
        const result = await Pipeline(start(), [setA, setB], options());

        expect(result.unwrapRight()).toEqual({ input: "x", a: "x1", b: "x12" });
    });

    it("with no steps returns right of a copy of the initial context and calls no hook", async () => {
        const ctx = start();
        const hooks = {
            onLeft: vi.fn(() => left<Err, Ctx>({ tag: "left" })),
            onException: vi.fn(() => left<Err, Ctx>({ tag: "crash" })),
            onConflictingKeys: vi.fn(() => left<Err, Ctx>({ tag: "conflict" })),
        };

        const result = await Pipeline(ctx, [], options(hooks));

        expect(result.unwrapRight()).toEqual(ctx);
        expect(result.unwrapRight()).not.toBe(ctx);
        expect(hooks.onLeft).not.toHaveBeenCalled();
        expect(hooks.onException).not.toHaveBeenCalled();
        expect(hooks.onConflictingKeys).not.toHaveBeenCalled();
    });

    it("returns an EitherAsync that can be chained before awaiting", async () => {
        const result = Pipeline(start(), [setA], options());

        expect(result).toBeInstanceOf(EitherAsync);
        expect(await Pipeline(start(), [setA], options()).map(c => c.a).match(v => v, () => "left")).toBe("x1");
    });

    it("accepts steps returning an Either, a Promise of an Either and an EitherAsync", async () => {
        const sync: Step<Err, Ctx> = ctx => right({ ...ctx, a: "sync" });
        const promised: Step<Err, Ctx> = async ctx => right({ ...ctx, b: "promise" });
        const eitherAsync: Step<Err, Ctx> = ctx => EitherAsync.right({ ...ctx, fixed: "eitherAsync" });

        const result = await Pipeline(start(), [sync, promised, eitherAsync], options());

        expect(result.unwrapRight()).toEqual({ input: "x", a: "sync", b: "promise", fixed: "eitherAsync" });
    });

    it("without onLeft, a step's left is the result and later steps do not run", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "nope" });
        const later = vi.fn(setB);

        const result = await Pipeline(start(), [failing, later], options());

        expect(result.unwrapLeft()).toEqual({ tag: "nope" });
        expect(later).not.toHaveBeenCalled();
    });

    it("continues with the next step when onLeft returns right", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "no-avatar" });
        const copyFixed: Step<Err, Ctx> = ctx => right({ ...ctx, b: ctx.fixed! });
        const onLeft = vi.fn((_: Err, ctx: Readonly<Ctx>) => right<Err, Ctx>({ ...ctx, fixed: "default" }));

        const result = await Pipeline(start(), [failing, copyFixed], options({ onLeft }));

        expect(result.unwrapRight().b).toBe("default");
        expect(onLeft).toHaveBeenCalledWith({ tag: "no-avatar" }, { input: "x" });
    });

    it("stops with onLeft's left", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "no-avatar" });
        const later = vi.fn(setB);

        const result = await Pipeline(start(), [failing, later], options({ onLeft: () => left({ tag: "mapped" }) }));

        expect(result.unwrapLeft()).toEqual({ tag: "mapped" });
        expect(later).not.toHaveBeenCalled();
    });

    it("calls onException with the thrown value and the context the step received, and continues on right", async () => {
        const throwing: Step<Err, Ctx> = () => { throw new Error("boom"); };
        const later = vi.fn(setB);
        const onException = vi.fn((_: unknown, ctx: Readonly<Ctx>) => right<Err, Ctx>({ ...ctx, fixed: "recovered" }));

        const result = await Pipeline(start(), [setA, throwing, later], options({ onException }));

        const [exception, ctx] = onException.mock.calls[0]!;
        expect((exception as Error).message).toBe("boom");
        expect(ctx.a).toBe("x1");
        expect(later).toHaveBeenCalled();
        expect(result.unwrapRight()).toEqual({ input: "x", a: "x1", fixed: "recovered", b: "x12" });
    });

    it("treats a rejected step promise like a throw", async () => {
        const rejecting: Step<Err, Ctx> = () => Promise.reject(new Error("rejected"));
        const onException = vi.fn((_: unknown, ctx: Readonly<Ctx>) => right<Err, Ctx>({ ...ctx, fixed: "recovered" }));

        const result = await Pipeline(start(), [rejecting], options({ onException }));

        expect((onException.mock.calls[0]![0] as Error).message).toBe("rejected");
        expect(result.unwrapRight().fixed).toBe("recovered");
    });

    it("calls onException with undefined for a step that throws undefined, and can recover", async () => {
        const throwing: Step<Err, Ctx> = () => { throw undefined; };
        const onException = vi.fn((_: unknown, ctx: Readonly<Ctx>) => right<Err, Ctx>({ ...ctx, fixed: "recovered" }));

        const result = await Pipeline(start(), [throwing, setA], options({ onException }));

        expect(onException).toHaveBeenCalledWith(undefined, { input: "x" });
        expect(result.unwrapRight()).toEqual({ input: "x", fixed: "recovered", a: "x1" });
    });

    it("calls onException with undefined for a step that rejects with no reason, and can recover", async () => {
        const rejecting: Step<Err, Ctx> = () => Promise.reject();
        const onException = vi.fn((_: unknown, ctx: Readonly<Ctx>) => right<Err, Ctx>({ ...ctx, fixed: "recovered" }));

        const result = await Pipeline(start(), [rejecting, setA], options({ onException }));

        expect(onException).toHaveBeenCalledWith(undefined, { input: "x" });
        expect(result.unwrapRight()).toEqual({ input: "x", fixed: "recovered", a: "x1" });
    });

    it("stops with onException's left; later steps do not run", async () => {
        const throwing: Step<Err, Ctx> = () => { throw new Error("boom"); };
        const later = vi.fn(setB);

        const result = await Pipeline(start(), [throwing, later], options());

        expect(result.unwrapLeft()).toEqual({ tag: "crash" });
        expect(later).not.toHaveBeenCalled();
    });

    it("calls onConflictingKeys with the keys, the received context and the returned context", async () => {
        const one: Step<Err, Ctx> = ctx => right({ ...ctx, a: "1" });
        const two: Step<Err, Ctx> = ctx => right({ ...ctx, a: "2" });
        const onConflictingKeys = vi.fn(() => left<Err, Ctx>({ tag: "conflict" }));

        await Pipeline(start(), [one, two], options({ onConflictingKeys }));

        expect(onConflictingKeys).toHaveBeenCalledWith(["a"], { input: "x", a: "1" }, { input: "x", a: "2" });
    });

    it("accepts the step's output when onConflictingKeys returns right(next)", async () => {
        const one: Step<Err, Ctx> = ctx => right({ ...ctx, a: "1" });
        const two: Step<Err, Ctx> = ctx => right({ ...ctx, a: "2" });
        const three = vi.fn(setB);

        const result = await Pipeline(start(), [one, two, three],
            options({ onConflictingKeys: (_keys, _ctx, next) => right(next) }));

        expect(result.unwrapRight().a).toBe("2");
        expect(three).toHaveBeenCalled();
    });

    it("stops with onConflictingKeys' left", async () => {
        const one: Step<Err, Ctx> = ctx => right({ ...ctx, a: "1" });
        const two: Step<Err, Ctx> = ctx => right({ ...ctx, a: "2" });
        const three = vi.fn(setB);

        const result = await Pipeline(start(), [one, two, three], options());

        expect(result.unwrapLeft()).toEqual({ tag: "conflict" });
        expect(three).not.toHaveBeenCalled();
    });

    it("reports a key the step dropped as a conflict", async () => {
        const dropping: Step<Err, Ctx> = ctx => right({ input: ctx.input });
        const onConflictingKeys = vi.fn(() => left<Err, Ctx>({ tag: "conflict" }));

        const result = await Pipeline(start(), [setA, dropping], options({ onConflictingKeys }));

        expect(result.unwrapLeft()).toEqual({ tag: "conflict" });
        expect(onConflictingKeys).toHaveBeenCalledWith(["a"], { input: "x", a: "x1" }, { input: "x" });
    });

    it("reports a new object with equal content as a conflict", async () => {
        const setU: Step<Err, Ctx> = ctx => right({ ...ctx, u: { id: 1 } });
        const copyU: Step<Err, Ctx> = ctx => right({ ...ctx, u: { ...ctx.u! } });
        const onConflictingKeys = vi.fn(() => left<Err, Ctx>({ tag: "conflict" }));

        await Pipeline(start(), [setU, copyU], options({ onConflictingKeys }));

        expect(onConflictingKeys).toHaveBeenCalledWith(["u"], expect.anything(), expect.anything());
    });

    it("accepts a step that returns the context it received unchanged", async () => {
        const step: Step<Err, Ctx> = ctx => right(ctx);
        const hooks = {
            onLeft: vi.fn(() => left<Err, Ctx>({ tag: "left" })),
            onException: vi.fn(() => left<Err, Ctx>({ tag: "crash" })),
            onConflictingKeys: vi.fn(() => left<Err, Ctx>({ tag: "conflict" })),
        };

        const result = await Pipeline(start(), [setA, step], options(hooks));

        expect(result.unwrapRight()).toEqual({ input: "x", a: "x1" });
        expect(hooks.onLeft).not.toHaveBeenCalled();
        expect(hooks.onException).not.toHaveBeenCalled();
        expect(hooks.onConflictingKeys).not.toHaveBeenCalled();
    });

    it("does not freeze the caller's object but freezes the contexts handed to steps and the result", async () => {
        const ctx = start();
        const received: Array<Readonly<Ctx>> = [];
        const spy = (step: Step<Err, Ctx>): Step<Err, Ctx> => current => {
            received.push(current);
            return step(current);
        };

        const result = await Pipeline(ctx, [spy(setA), spy(setB)], options());

        expect(Object.isFrozen(ctx)).toBe(false);
        expect(received).toHaveLength(2);
        expect(received.every(Object.isFrozen)).toBe(true);
        expect(Object.isFrozen(result.unwrapRight())).toBe(true);
    });

    it("does not conflict-check the context a hook returns", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "no-avatar" });
        const onConflictingKeys = vi.fn(() => left<Err, Ctx>({ tag: "conflict" }));

        const result = await Pipeline(start(), [setA, failing], options({
            onLeft: (_, ctx) => right({ ...ctx, a: "changed" }),
            onConflictingKeys,
        }));

        expect(onConflictingKeys).not.toHaveBeenCalled();
        expect(result.unwrapRight().a).toBe("changed");
    });

    it("rejects when a hook throws", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "no-avatar" });

        await expect(Promise.resolve(Pipeline(start(), [failing], options({
            onLeft: () => { throw new Error("hook boom"); },
        })))).rejects.toThrow("hook boom");
    });

    it("rejects when a hook returns a rejected promise", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "no-avatar" });

        await expect(Promise.resolve(Pipeline(start(), [failing], options({
            onLeft: () => Promise.reject(new Error("hook rejected")),
        })))).rejects.toThrow("hook rejected");
    });

    it("rejects when onException throws, without calling it again", async () => {
        const throwing: Step<Err, Ctx> = () => { throw new Error("step boom"); };
        const onException = vi.fn((): never => { throw new Error("onException boom"); });

        await expect(Promise.resolve(Pipeline(start(), [throwing], options({ onException }))))
            .rejects.toThrow("onException boom");
        expect(onException).toHaveBeenCalledTimes(1);
    });

    it("freezes the context a hook returns before the next step receives it", async () => {
        const failing: Step<Err, Ctx> = () => left({ tag: "no-avatar" });
        const received: Array<Readonly<Ctx>> = [];
        const spy: Step<Err, Ctx> = ctx => { received.push(ctx); return right(ctx); };

        await Pipeline(start(), [failing, spy], options({ onLeft: (_, ctx) => right({ ...ctx, fixed: "default" }) }));

        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({ input: "x", fixed: "default" });
        expect(Object.isFrozen(received[0])).toBe(true);
    });

    it("runs 2000 steps without overflowing the stack", async () => {
        type Counter = { count: number };
        const increment: Step<Err, Counter> = ctx => right({ count: ctx.count + 1 });
        const counterOptions: PipelineOptions<Err, Counter> = {
            onException: () => left({ tag: "crash" }),
            onConflictingKeys: (_keys, _ctx, next) => right(next),
        };

        const result = await Pipeline({ count: 0 }, Array.from({ length: 2000 }, () => increment), counterOptions);

        expect(result.unwrapRight().count).toBe(2000);
    });
});
