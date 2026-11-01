import { describe, expect, it } from "vitest";
import { right } from "@ngwes/mini-fp";
import { stepsOf } from "../src/dynamic-steps/stepsOf.js";
import type { Step } from "../src/pipeline/types.js";

type Ctx = { value: string };

const path = "/steps/some-file.ts";

const f: Step<string, Ctx> = async ctx => right(ctx);
const g: Step<string, Ctx> = async ctx => right(ctx);
const h: Step<string, Ctx> = async ctx => right(ctx);

const load = (module: Record<string, unknown>) => stepsOf<string, Ctx>(path, module);

describe("stepsOf", () => {
    it("reads a single default export function", () => {
        expect(load({ default: f }).unwrapRight()).toEqual([f]);
    });

    it("reads a default export array", () => {
        expect(load({ default: [f, g] }).unwrapRight()).toEqual([f, g]);
    });

    it("prefers the named steps export over the default export", () => {
        const steps = load({ steps: [f, g], default: h }).unwrapRight();

        expect(steps).toEqual([f, g]);
    });

    it("accepts an empty array", () => {
        expect(load({ default: [] }).unwrapRight()).toEqual([]);
    });

    it("rejects a module with no steps or default export", () => {
        const error = load({}).unwrapLeft();

        expect(error).toEqual({ tag: "invalid-export", path, detail: "no steps or default export" });
    });

    it("rejects a default export that is not a function or an array", () => {
        const error = load({ default: 42 }).unwrapLeft();

        expect(error).toEqual({ tag: "invalid-export", path, detail: "default export is a number" });
    });

    it("rejects an array that contains something other than functions", () => {
        const error = load({ default: [f, "x"] }).unwrapLeft();

        expect(error).toEqual({ tag: "invalid-export", path, detail: "default export contains a string, not a step" });
    });

    it.each([
        [[f, undefined], "default export contains undefined, not a step"],
        [[f, null], "default export contains null, not a step"],
        [[f, {}], "default export contains an object, not a step"],
        [{ run: f }, "default export is an object"],
    ])("describes the invalid default export %o", (exported, detail) => {
        expect(load({ default: exported }).unwrapLeft()).toEqual({ tag: "invalid-export", path, detail });
    });

    it("rejects a module whose default export is null or undefined as having none", () => {
        expect(load({ default: null }).unwrapLeft()).toEqual({ tag: "invalid-export", path, detail: "no steps or default export" });
        expect(load({ default: undefined }).unwrapLeft()).toEqual({ tag: "invalid-export", path, detail: "no steps or default export" });
    });

    it("names the steps export when that is the invalid one", () => {
        const error = load({ steps: "nope", default: f }).unwrapLeft();

        expect(error).toEqual({ tag: "invalid-export", path, detail: "steps export is a string" });
    });
});
