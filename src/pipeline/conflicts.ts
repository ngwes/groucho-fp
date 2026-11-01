import { toOption } from "@ngwes/mini-fp";
import type { Option } from "@ngwes/mini-fp";

/**
 * Keys holding a defined value in `previous` that `next` changed or dropped.
 * Keys only present in `next` (or undefined in `previous`) never conflict.
 * Returns `none` when nothing conflicts.
 */
export const conflictingKeys = <Ctx extends object>(
    previous: Readonly<Ctx>,
    next: Readonly<Ctx>,
): Option<ReadonlyArray<keyof Ctx & string>> =>
    toOption(
        (Object.keys(previous) as Array<keyof Ctx & string>).filter(
            key => previous[key] !== undefined && next[key] !== previous[key],
        ),
        keys => keys.length === 0,
    );
