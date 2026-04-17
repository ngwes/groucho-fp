import { describe, expect, it } from "vitest";
import { loadSteps, loadStepsFromDir } from "../src/dynamic-steps/dynamicSteps.js";
import { fileURLToPath } from "node:url";

const fixture = (name: string) =>
    fileURLToPath(new URL(`fixtures/dynamic-steps/${name}`, import.meta.url));

const fixturesDir = fileURLToPath(new URL("fixtures/dynamic-steps/", import.meta.url));

class StepCtx {
    value1?: string;
    value2?: string;
    value3?: string;
    constructor(public value: string) { }
}

describe("loadSteps", () => {
    it("loads a single step from a default export function", async () => {
        const steps = await loadSteps<string, StepCtx>([
            fixture("default-fn.ts")
        ]);

        expect(steps).toHaveLength(1);
        const result = await steps[0](new StepCtx("test"));
        expect(result.unwrapRight().value1).toBe("test:fn");
    });

    it("loads multiple steps from a default export array", async () => {
        const steps = await loadSteps<string, StepCtx>([
            fixture("default-array.ts")
        ]);

        expect(steps).toHaveLength(2);
        const r1 = await steps[0](new StepCtx("test"));
        const r2 = await steps[1](new StepCtx("test"));
        expect(r1.unwrapRight().value2).toBe("test:arr1");
        expect(r2.unwrapRight().value3).toBe("test:arr2");
    });

    it("loads multiple steps from a named steps export", async () => {
        const steps = await loadSteps<string, StepCtx>([
            fixture("named-steps.ts")
        ]);

        expect(steps).toHaveLength(2);
        const r1 = await steps[0](new StepCtx("test"));
        const r2 = await steps[1](new StepCtx("test"));
        expect(r1.unwrapRight().value1).toBe("test:named1");
        expect(r2.unwrapRight().value2).toBe("test:named2");
    });

    it("returns empty array for file with no recognized export", async () => {
        const steps = await loadSteps<string, StepCtx>([
            fixture("no-export.ts")
        ]);

        expect(steps).toHaveLength(0);
    });

    it("concatenates steps from multiple files in order", async () => {
        const steps = await loadSteps<string, StepCtx>([
            fixture("default-fn.ts"),
            fixture("default-array.ts"),
        ]);

        expect(steps).toHaveLength(3);
        const r1 = await steps[0](new StepCtx("test"));
        const r2 = await steps[1](new StepCtx("test"));
        const r3 = await steps[2](new StepCtx("test"));
        expect(r1.unwrapRight().value1).toBe("test:fn");
        expect(r2.unwrapRight().value2).toBe("test:arr1");
        expect(r3.unwrapRight().value3).toBe("test:arr2");
    });
});

describe("loadStepsFromDir", () => {
    it("loads all matching files from a directory ordered by name", async () => {
        // default-array.ts (2) + default-fn.ts (1) + named-steps.ts (2) + no-export.ts (0) = 5
        const steps = await loadStepsFromDir<string, StepCtx>(fixturesDir);

        expect(steps).toHaveLength(5);
    });

    it("returns empty array for an empty directory", async () => {
        const steps = await loadStepsFromDir<string, StepCtx>(
            fixture("empty")
        );

        expect(steps).toHaveLength(0);
    });

    it("loads only files matching a custom pattern", async () => {
        const steps = await loadStepsFromDir<string, StepCtx>(
            fixture("custom"),
            { pattern: /\.custom\.ts$/ }
        );

        expect(steps).toHaveLength(1);
        const result = await steps[0](new StepCtx("test"));
        expect(result.unwrapRight().value1).toBe("test:custom");
    });
});