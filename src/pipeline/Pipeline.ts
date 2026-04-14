import { Either, Option, EitherAsync } from "@ngwes/mini-fp";

const { from, right } = EitherAsync
const { from: optionFrom} = Option

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
            context = await context.bindAsync(ctx => from(step(ctx))
                .bindLeftAsync(err => options.onLeft(err, ctx))
                .bindAsync(_ => getConflictingKeys<Ctx>(_, ctx)
                               .map(_ => from(options.onConflictingKeys(_ as string[], ctx)))
                               .orElse(right<E, Readonly<Ctx>>(Object.freeze(_)) )
                ))
        }
    }
    catch (err) {
        return context.bindAsync(_ => options.onException(err, _));
    }

    return context;
}

const getConflictingKeys = <Ctx extends object>(result: Ctx, context: Readonly<Ctx>) : Option<(keyof Ctx)[]> =>
    optionFrom((Object.keys(result) as Array<keyof Ctx>)
.filter((k) => context[k] !== undefined &&
               result[k] !== context[k]),
         _ => _.length == 0);