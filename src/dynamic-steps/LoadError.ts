/** Why a steps file could not be loaded. `path` is always the absolute path of the file. */
export type LoadError =
    /** The file or directory does not exist. */
    | { tag: "not-found"; path: string; cause: unknown }
    /** The file exists but importing it failed: a syntax error, a module that threw, a missing dependency. */
    | { tag: "import-failed"; path: string; cause: unknown }
    /** The file imported fine but has no usable `steps` or `default` export. */
    | { tag: "invalid-export"; path: string; detail: string };
