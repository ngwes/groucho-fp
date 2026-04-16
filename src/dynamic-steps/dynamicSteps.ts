import { type Step } from "../pipeline/Pipeline.js"
import { join, resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { createJiti } from "jiti"
import { constants } from "./dynamic-steps-constants.js"

const jiti = createJiti(import.meta.url);

export type DynamicStepModule<L, Ctx> =
    | { default: Step<L, Ctx> }
    | { default: ReadonlyArray<Step<L, Ctx>> }
    | { steps: ReadonlyArray<Step<L, Ctx>> };


export const loadSteps = async <L, Ctx>(paths: string[]): Promise<ReadonlyArray<Step<L, Ctx>>> => {

    let steps: Step<L, Ctx>[] = [];

    for (const path of paths) {
        steps = steps.concat(await importSteps<L, Ctx>(path));
    }

    return steps;
};

export const loadStepsFromDir = async <L, Ctx>(
    path: string,
    options?: { pattern?: RegExp }): Promise<ReadonlyArray<Step<L, Ctx>>> => {
    const fileNamePatterns = options?.pattern ?? constants.filePatterns;
    const absolutePath = resolve(path);

    const entries = await readdir(absolutePath, { withFileTypes: true });

    const paths = entries
        .filter(f => f.isFile() && fileNamePatterns.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => join(absolutePath, e.name))

    return await loadSteps(paths);
}


async function importSteps<L, Ctx>(path: string): Promise<Step<L, Ctx>[]> {
    let steps: Step<L, Ctx>[] = [];

    const readStep = await jiti.import(resolve(path)) as Record<string, unknown>;

    const imported = readStep.default ?? readStep.steps;

    if (typeof imported === constants.functionKey)
        steps.push(imported as Step<L, Ctx>);
    else {
        if (Array.isArray(imported))
            steps.push(...imported as Step<L, Ctx>[]);
    }

    return steps;
}
