import { Either } from "@ngwes/mini-fp";

type Ctx = { value: string; value1?: string; value2?: string };

const step1 = async (ctx: Ctx) =>
    Either.right({ ...ctx, value1: ctx.value + ":named1" });

const step2 = async (ctx: Ctx) =>
    Either.right({ ...ctx, value2: ctx.value + ":named2" });

export const steps = [step1, step2];