import { Either } from "@ngwes/mini-fp";

type Ctx = { value: string };

const step1 = async (ctx: Ctx) =>
    Either.right({ ...ctx, value2: ctx.value + ":arr1" });

const step2 = async (ctx: Ctx) =>
    Either.right({ ...ctx, value3: ctx.value + ":arr2" });

export default [step1, step2];