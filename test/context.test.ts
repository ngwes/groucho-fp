import { describe, expect, it } from "vitest";
import { freezeCopy } from "../src/pipeline/context.js";

describe("freezeCopy", () => {
    const obj = { a: "1", nested: { n: 1 } };

    it("returns a frozen object", () =>
        expect(Object.isFrozen(freezeCopy(obj))).toBe(true));

    it("returns a different object with the same own properties", () => {
        const copy = freezeCopy(obj);
        expect(copy).not.toBe(obj);
        expect(copy).toEqual(obj);
        expect(Object.keys(copy)).toEqual(Object.keys(obj));
    });

    it("leaves the original object unfrozen", () => {
        freezeCopy(obj);
        expect(Object.isFrozen(obj)).toBe(false);
    });
});
