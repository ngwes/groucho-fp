import { describe, expect, it } from "vitest";
import { conflictingKeys } from "../src/pipeline/conflicts.js";

type Ctx = { a?: string | null; b?: string | undefined; u?: { id: number } };

const keys = (previous: Ctx, next: Ctx): ReadonlyArray<string> =>
    conflictingKeys(previous, next).match(found => found, () => []);

describe("conflictingKeys", () => {
    it("reports a key whose defined value changed", () =>
        expect(keys({ a: "1" }, { a: "2" })).toEqual(["a"]));

    it("ignores new keys", () =>
        expect(keys({ a: "1" } as Ctx, { a: "1", b: "x" })).toEqual([]));

    it("ignores writing a key that was undefined", () =>
        expect(keys({ a: "1", b: undefined }, { a: "1", b: "x" })).toEqual([]));

    it("reports a key the step dropped", () =>
        expect(keys({ a: "1", b: "2" }, { b: "2" } as Ctx)).toEqual(["a"]));

    it("reports overwriting null", () =>
        expect(keys({ a: null }, { a: "x" })).toEqual(["a"]));

    it("reports a new object with equal content", () => {
        const u = { id: 1 };
        expect(keys({ u }, { u: { ...u } })).toEqual(["u"]);
    });

    it("lists keys in the order of the previous context", () =>
        expect(keys({ b: "1", a: "1" }, { b: "2", a: "2" })).toEqual(["b", "a"]));

    it("is none when nothing conflicts", () =>
        expect(conflictingKeys({ a: "1" }, { a: "1" }).isNone()).toBe(true));
});
