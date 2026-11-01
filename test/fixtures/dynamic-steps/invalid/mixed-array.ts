import { Either } from "@ngwes/mini-fp";

const step = async (ctx: { value: string }) => Either.right(ctx);

export default [step, "x"];
