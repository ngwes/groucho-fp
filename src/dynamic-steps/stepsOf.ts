import { left, right, which, type Either } from "@ngwes/mini-fp";
import type { Step } from "../pipeline/types.js";
import type { LoadError } from "./LoadError.js";

type Found = { source: "steps" | "default"; value: unknown };

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === "function";

// jiti answers a missing or undefined `default` with the whole module (so `module.exports = step` loads).
// For the error message, a default only counts when the module itself holds one.
const holdsDefault = (module: Record<string, unknown>): boolean => {
    const descriptor = Object.getOwnPropertyDescriptor(module, "default");
    return descriptor !== undefined && !("value" in descriptor && descriptor.value == null);
};

const kindOf = (value: unknown): string =>
    value == null ? String(value) : `${/^[aeiou]/.test(typeof value) ? "an" : "a"} ${typeof value}`;

const describe = (module: Record<string, unknown>, { source, value }: Found): string =>
    value == null || (source === "default" && !holdsDefault(module))
        ? "no steps or default export"
        : Array.isArray(value)
            ? `${source} export contains ${kindOf(value.find(item => !isFunction(item)))}, not a step`
            : `${source} export is ${kindOf(value)}`;

/**
 * Reads the steps a module exports: the `steps` export if present, else the `default` export,
 * either a single step function or an array of them.
 */
export const stepsOf = <E, Ctx>(
    path: string,
    module: Record<string, unknown>,
): Either<LoadError, Step<E, Ctx>[]> => {
    const found: Found = module.steps != null
        ? { source: "steps", value: module.steps }
        : { source: "default", value: module.default };
    const candidates: unknown[] = Array.isArray(found.value) ? found.value : [found.value];

    return which(
        () => candidates.every(isFunction),
        () => right<LoadError, Step<E, Ctx>[]>(candidates as Step<E, Ctx>[]),
        () => left<LoadError, Step<E, Ctx>[]>({ tag: "invalid-export", path, detail: describe(module, found) }),
    );
};
