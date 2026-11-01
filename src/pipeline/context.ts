export const freezeCopy = <Ctx extends object>(ctx: Ctx): Readonly<Ctx> =>
    Object.freeze({ ...ctx });
