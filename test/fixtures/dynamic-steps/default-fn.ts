import { Either } from "@ngwes/mini-fp";

type Ctx = { value: string; value1?: string };

const step = async (ctx: Ctx) =>
    Either.right({ ...ctx, value1: ctx.value + ":fn" });

export default step;