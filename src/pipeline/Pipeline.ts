import { Either, EitherAsync, asTask } from "@ngwes/mini-fp";

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
    let context = Object.freeze(ctx);

    try {
        for (const step of steps) {
            const resultEither = await step(context);

            if (resultEither.isLeft())
                return options.onLeft(resultEither.unwrapLeft(), context)

            const result = resultEither.unwrapRight();
            const conflictingKeys = (Object.keys(result) as Array<keyof Ctx>)
                .filter((k) => context[k] !== undefined && result[k] !== context[k]);

            if (conflictingKeys.length !== 0)
                return options.onConflictingKeys(conflictingKeys as string[], context);

            context = Object.freeze(result);
        }
    }
    catch (err) {
        return options.onException(err, context);
    }

    return Either.right(context);
}

export async function PipelineFp<E, Ctx extends object>(
    ctx: Ctx,
    steps: ReadonlyArray<Step<E, Ctx>>,
    options: PipelineOptions<E, Ctx>
): Promise<Either<E, Readonly<Ctx>>> {
    let c = Either.right<E, Readonly<Ctx>>(Object.freeze(ctx));
    try {
        for (const step of steps) {
             c = await c.bindAsync(async ctx => (await step(ctx))
            .bindLeftAsync(err => options.onLeft(err, ctx))
            .bindAsync(_ => {
                const keys = getConflictingKeys<Ctx>(_, ctx)
                return keys.length > 0 ? options.onConflictingKeys(keys as string[], ctx) :
                                         asTask(Either.right<E, Readonly<Ctx>>(Object.freeze(_)));
            }))
        }
    }
    catch (err) {
        return c.bindAsync(_ => options.onException(err, _));
    }

    return c;
}

function getConflictingKeys<Ctx extends object>(result: Ctx, context: Readonly<Ctx>) {
    return (Object.keys(result) as Array<keyof Ctx>)
        .filter((k) => context[k] !== undefined && result[k] !== context[k]);
}
