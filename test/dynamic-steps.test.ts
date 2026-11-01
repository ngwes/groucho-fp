import { describe, expect, it } from "vitest";
import { loadSteps, loadStepsFromDir } from "../src/dynamic-steps/dynamicSteps.js";
import { fileURLToPath } from "node:url";
import { relative } from "node:path";

const fixture = (name: string) =>
    fileURLToPath(new URL(`fixtures/dynamic-steps/${name}`, import.meta.url));

class StepCtx {
    value1?: string;
    value2?: string;
    value3?: string;
    constructor(public value: string) { }
}

describe("loadSteps", () => {
    it("loads a single step from a default export function", async () => {
        const steps = (await loadSteps<string, StepCtx>([fixture("valid/default-fn.ts")])).unwrapRight();

        expect(steps).toHaveLength(1);
        const result = await steps[0]!(new StepCtx("test"));
        expect(result.unwrapRight().value1).toBe("test:fn");
    });

    it("loads multiple steps from a default export array", async () => {
        const steps = (await loadSteps<string, StepCtx>([fixture("valid/default-array.ts")])).unwrapRight();

        expect(steps).toHaveLength(2);
        const r1 = await steps[0]!(new StepCtx("test"));
        const r2 = await steps[1]!(new StepCtx("test"));
        expect(r1.unwrapRight().value2).toBe("test:arr1");
        expect(r2.unwrapRight().value3).toBe("test:arr2");
    });

    it("loads multiple steps from a named steps export", async () => {
        const steps = (await loadSteps<string, StepCtx>([fixture("valid/named-steps.ts")])).unwrapRight();

        expect(steps).toHaveLength(2);
        const r1 = await steps[0]!(new StepCtx("test"));
        const r2 = await steps[1]!(new StepCtx("test"));
        expect(r1.unwrapRight().value1).toBe("test:named1");
        expect(r2.unwrapRight().value2).toBe("test:named2");
    });

    it("concatenates steps from multiple files in path order", async () => {
        const steps = (await loadSteps<string, StepCtx>([
            fixture("valid/default-fn.ts"),
            fixture("valid/default-array.ts"),
        ])).unwrapRight();

        expect(steps).toHaveLength(3);
        const r1 = await steps[0]!(new StepCtx("test"));
        const r2 = await steps[1]!(new StepCtx("test"));
        const r3 = await steps[2]!(new StepCtx("test"));
        expect(r1.unwrapRight().value1).toBe("test:fn");
        expect(r2.unwrapRight().value2).toBe("test:arr1");
        expect(r3.unwrapRight().value3).toBe("test:arr2");
    });

    it("returns an empty list for a file that exports an empty array", async () => {
        const result = await loadSteps<string, StepCtx>([fixture("valid/empty-array.ts")]);

        expect(result.unwrapRight()).toEqual([]);
    });

    it("reports every bad file, in path order", async () => {
        const result = await loadSteps<string, StepCtx>([
            fixture("invalid/no-export.ts"),
            fixture("valid/missing.ts"),
            fixture("broken/syntax-error.mjs"),
        ]);

        const errors = result.unwrapLeft();
        expect(errors.map(error => error.tag)).toEqual(["invalid-export", "not-found", "import-failed"]);
        expect(errors.map(error => error.path)).toEqual([
            fixture("invalid/no-export.ts"),
            fixture("valid/missing.ts"),
            fixture("broken/syntax-error.mjs"),
        ]);
    });

    it("keeps a module that throws null on import among the other errors", async () => {
        const result = await loadSteps<string, StepCtx>([
            fixture("broken/throws-null.ts"),
            fixture("valid/missing.ts"),
            fixture("valid/default-fn.ts"),
        ]);

        expect(result.unwrapLeft()).toEqual([
            { tag: "import-failed", path: fixture("broken/throws-null.ts"), cause: null },
            expect.objectContaining({ tag: "not-found", path: fixture("valid/missing.ts") }),
        ]);
    });

    it("resolves relative paths against the working directory and reports them absolute", async () => {
        const missing = fixture("valid/missing.ts");

        const result = await loadSteps<string, StepCtx>([relative(process.cwd(), missing)]);

        expect(result.unwrapLeft()[0]).toMatchObject({ tag: "not-found", path: missing });
    });
});

describe("loadStepsFromDir", () => {
    it("loads the step files of a directory ordered by name, skipping declaration, test and spec files", async () => {
        // default-array.ts (2) + default-fn.ts (1) + empty-array.ts (0) + named-steps.ts (2) = 5
        // helpers.test.ts, helpers.spec.ts and types.d.ts would fail to load as steps, so they must be skipped.
        const steps = (await loadStepsFromDir<string, StepCtx>(fixture("valid"))).unwrapRight();

        expect(steps).toHaveLength(5);
        const first = await steps[0]!(new StepCtx("test"));
        expect(first.unwrapRight().value2).toBe("test:arr1");
    });

    it("returns an empty list for an empty directory", async () => {
        const result = await loadStepsFromDir<string, StepCtx>(fixture("empty"));

        expect(result.unwrapRight()).toEqual([]);
    });

    it("reports a missing directory as not-found", async () => {
        const dir = fixture("does-not-exist");

        const result = await loadStepsFromDir<string, StepCtx>(dir);

        const errors = result.unwrapLeft();
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ tag: "not-found", path: dir });
    });

    it("loads only files matching a custom pattern", async () => {
        const steps = (await loadStepsFromDir<string, StepCtx>(
            fixture("custom"),
            { pattern: /\.custom\.ts$/ },
        )).unwrapRight();

        expect(steps).toHaveLength(1);
        const result = await steps[0]!(new StepCtx("test"));
        expect(result.unwrapRight().value1).toBe("test:custom");
    });

    it("fails the whole load when a file is not a step file", async () => {
        const result = await loadStepsFromDir<string, StepCtx>(fixture("invalid"));

        const errors = result.unwrapLeft();
        expect(errors.map(error => error.tag)).toEqual(["invalid-export", "invalid-export", "invalid-export", "invalid-export"]);
    });
});
