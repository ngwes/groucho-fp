import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { importModule } from "../src/dynamic-steps/importModule.js";

const fixture = (name: string) =>
    fileURLToPath(new URL(`fixtures/dynamic-steps/${name}`, import.meta.url));

describe("importModule", () => {
    it("imports a module and returns its exports", async () => {
        const module = (await importModule(fixture("valid/default-fn.ts"))).unwrapRight();

        expect(typeof module.default).toBe("function");
    });

    it("reports a missing file as not-found", async () => {
        const path = fixture("valid/does-not-exist.ts");

        const error = (await importModule(path)).unwrapLeft();

        expect(error).toMatchObject({ tag: "not-found", path });
        expect(error).toHaveProperty("cause");
    });

    it("reports a syntax error as import-failed", async () => {
        const path = fixture("broken/syntax-error.mjs");

        const error = (await importModule(path)).unwrapLeft();

        expect(error).toMatchObject({ tag: "import-failed", path });
    });

    it("reports a module that throws on import as import-failed, keeping the cause", async () => {
        const path = fixture("broken/throws-on-import.ts");

        const error = (await importModule(path)).unwrapLeft();

        expect(error).toMatchObject({ tag: "import-failed", path });
        expect((error as { cause: Error }).cause.message).toBe("boom on import");
    });
});
