import { Either } from "@ngwes/mini-fp";

type Ctx = { value: string; value2?: string };

const step = async (ctx: Ctx) =>
    Either.right({ ...ctx, value2: ctx.value + ":another" });

export default step;
