import { Either } from "@ngwes/mini-fp";

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
): Promise<Either<E, Readonly<Ctx>>> 
{
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