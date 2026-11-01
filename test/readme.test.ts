import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Every ```ts / ```typescript block of the README compiles against the real API.
// Each block is its own module: it brings its own imports (and may `declare` what it only refers to).
// Blocks that only show a signature are tagged ```ts skip and are not compiled.

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8").replace(/\r\n/g, "\n");

type Block = { line: number; fileName: string; code: string };

const blocks: Block[] = (() => {
    const found: Block[] = [];
    let open: { line: number; compile: boolean; code: string[] } | undefined;
    readme.split("\n").forEach((text, index) => {
        const fence = text.match(/^\s*```(.*)$/);
        if (open === undefined) {
            if (fence) {
                const info = (fence[1] ?? "").trim().split(/\s+/);
                const compile = (info[0] === "ts" || info[0] === "typescript") && !info.includes("skip");
                open = { line: index + 1, compile, code: [] };
            }
        } else if (fence) {
            if (open.compile) {
                found.push({
                    line: open.line,
                    // next to package.json and node_modules, so imports resolve as in a user's project
                    fileName: join(root, `readme-block-line-${open.line}.ts`).replace(/\\/g, "/"),
                    code: open.code.join("\n"),
                });
            }
            open = undefined;
        } else {
            open.code.push(text);
        }
    });
    return found;
})();

const options: ts.CompilerOptions = {
    strict: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    moduleDetection: ts.ModuleDetectionKind.Force,
    target: ts.ScriptTarget.ES2022,
    types: ["node"],
    noEmit: true,
    skipLibCheck: true,
    paths: { "@ngwes/groucho-fp": [join(root, "src/index.ts").replace(/\\/g, "/")] },
};

const diagnosticsByFile = (() => {
    const sources = new Map(blocks.map(block => [block.fileName, block.code]));
    const host = ts.createCompilerHost(options);
    const readFile = host.readFile.bind(host);
    const fileExists = host.fileExists.bind(host);
    const getSourceFile = host.getSourceFile.bind(host);
    host.readFile = fileName => sources.get(fileName.replace(/\\/g, "/")) ?? readFile(fileName);
    host.fileExists = fileName => sources.has(fileName.replace(/\\/g, "/")) || fileExists(fileName);
    host.getSourceFile = (fileName, languageVersion, ...rest) => {
        const code = sources.get(fileName.replace(/\\/g, "/"));
        return code === undefined
            ? getSourceFile(fileName, languageVersion, ...rest)
            : ts.createSourceFile(fileName, code, languageVersion, true);
    };

    const program = ts.createProgram([...sources.keys()], options, host);
    const global = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file === undefined);

    return new Map(blocks.map(block => {
        const file = program.getSourceFile(block.fileName);
        const own = file === undefined ? [] : ts.getPreEmitDiagnostics(program, file);
        return [block.fileName, [...global, ...own]];
    }));
})();

const describeDiagnostic = (block: Block, diagnostic: ts.Diagnostic): string => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
    const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    // +1 for the fence line, +1 because getLineAndCharacterOfPosition counts from 0
    return `README.md:${block.line + line + 1}: ${message}`;
};

describe("README examples", () => {
    it("has typescript blocks to check", () => {
        expect(blocks.length).toBeGreaterThan(0);
    });

    it.each(blocks.map(block => [block.line, block] as const))(
        "the block at README line %i compiles",
        (_line, block) => {
            const messages = (diagnosticsByFile.get(block.fileName) ?? []).map(d => describeDiagnostic(block, d));
            expect(messages).toEqual([]);
        },
    );
});
