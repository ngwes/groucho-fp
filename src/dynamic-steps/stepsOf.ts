import { left, right, which, type Either } from "@ngwes/mini-fp";
import type { Step } from "../pipeline/types.js";
import type { LoadError } from "./LoadError.js";

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === "function";

const describeFound = (module: Record<string, unknown>): string => {
    const source = module.steps != null ? "steps" : "default";
    const found = module[source];
    return found == null
        ? "no steps or default export"
        : Array.isArray(found)
            ? `${source} export contains a ${typeof found.find(item => !isFunction(item))}, not a step`
            : `${source} export is a ${typeof found}`;
};

/**
 * Reads the steps a module exports: the `steps` export if present, else the `default` export,
 * either a single step function or an array of them.
 */
export const stepsOf = <E, Ctx>(
    path: string,
    module: Record<string, unknown>,
): Either<LoadError, Step<E, Ctx>[]> => {
    const found = module.steps ?? module.default;
    const candidates: unknown[] = Array.isArray(found) ? found : [found];

    return which(
        () => candidates.every(isFunction),
        () => right<LoadError, Step<E, Ctx>[]>(candidates as Step<E, Ctx>[]),
        () => left<LoadError, Step<E, Ctx>[]>({ tag: "invalid-export", path, detail: describeFound(module) }),
    );
};
