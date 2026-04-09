import { Either, asTask } from "@ngwes/mini-fp";

export type Step<E, Ctx> = (ctx: Readonly<Ctx>) => Promise<Either<E, Ctx>>;

export interface PipelineOptions<E, Ctx extends object> {
    onLeft: (err: E, ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>,
    onException: (exception: unknown, ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>,
    onConflictingKeys: (keys: ReadonlyArray<string>, ctx: Readonly<Ctx>) => Promise<Either<E, Readonly<Ctx>>>
}

export async function Pipeline<E, Ctx extends object>(
    ctx: Ctx,
    steps: ReadonlyArray<Step<E, Ctx>>,
    options: PipelineOptions<E, Ctx>
): Promise<Either<E, Readonly<Ctx>>> {
    let context = Either.right<E, Readonly<Ctx>>(Object.freeze(ctx));
    try {
        for (const step of steps) {
             context = await context.bindAsync(async ctx => (await step(ctx))
            .bindLeftAsync(err => options.onLeft(err, ctx))
            .bindAsync(_ => {
                const keys = getConflictingKeys<Ctx>(_, ctx)
                return keys.length > 0 ? options.onConflictingKeys(keys as string[], ctx) :
                                         asTask(Either.right<E, Readonly<Ctx>>(Object.freeze(_)));
            }))
        }
    }
    catch (err) {
        return context.bindAsync(_ => options.onException(err, _));
    }

    return context;
}

function getConflictingKeys<Ctx extends object>(result: Ctx, context: Readonly<Ctx>) {
    return (Object.keys(result) as Array<keyof Ctx>)
        .filter((k) => context[k] !== undefined && result[k] !== context[k]);
}
