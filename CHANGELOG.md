## [2.0.1](https://github.com/ngwes/groucho-fp/compare/v2.0.0...v2.0.1) (2026-11-01)


### Bug Fixes

* license groucho-fp under apache-2.0 with a notice file ([#4](https://github.com/ngwes/groucho-fp/issues/4)) ([ee610eb](https://github.com/ngwes/groucho-fp/commit/ee610eb59408d2f8f928dfcdb1f52ae04dc72256))

# [2.0.0](https://github.com/ngwes/groucho-fp/compare/v1.2.1...v2.0.0) (2026-11-01)


* build!: require @ngwes/mini-fp 2 ([f462449](https://github.com/ngwes/groucho-fp/commit/f46244906d2a17f25fa259ae38d5f7e9f50b4bc8))
* feat(dynamic-steps)!: return load errors instead of throwing ([0fb790f](https://github.com/ngwes/groucho-fp/commit/0fb790feaae910a36133ae137d76137ce44b26b9))
* feat(pipeline)!: return EitherAsync and let every hook recover ([8ad4ffb](https://github.com/ngwes/groucho-fp/commit/8ad4ffb46c00ba7f192423fa2f38913e67c762da))


### Bug Fixes

* **dynamic-steps:** describe invalid exports accurately ([f877610](https://github.com/ngwes/groucho-fp/commit/f87761077479edc84316d22e0dd8e6daf97c4632))
* **dynamic-steps:** ignore the g and y flags of a custom pattern ([cb8320a](https://github.com/ngwes/groucho-fp/commit/cb8320ac5d12e7a6f10943badc0554eb25463314)), closes [RegExp#test](https://github.com/RegExp/issues/test)
* **dynamic-steps:** report a module that throws or exports null as a load error ([f7f2f7b](https://github.com/ngwes/groucho-fp/commit/f7f2f7b401ae1106915ae15078df6ddb014e30d6))
* **pipeline:** send a step's undefined exception to onException ([671a6bc](https://github.com/ngwes/groucho-fp/commit/671a6bc0129398a16af702c7741f789f8c1da38b))


### Features

* **dynamic-steps:** classify per-file load failures as LoadError ([eeca97b](https://github.com/ngwes/groucho-fp/commit/eeca97bae23dc457fe807f0c972c8916cedb7d1d))
* **pipeline:** add conflict detection that catches dropped keys ([15f0689](https://github.com/ngwes/groucho-fp/commit/15f0689cdaa24f7e044d5fc9d154f235d89dd62a))


### BREAKING CHANGES

* loadSteps and loadStepsFromDir return
EitherAsync<ReadonlyArray<LoadError>, ReadonlyArray<Step>>. A module without a usable
steps or default export is an invalid-export error instead of being skipped. The default
pattern skips .d.ts, .test.* and .spec.* files.
* Pipeline returns EitherAsync instead of a native Promise.
Steps and hooks may return an Either, a promise of one or an EitherAsync.
onLeft is optional. A hook returning right now continues with the next step
for all hooks, including onException. onConflictingKeys receives (keys, ctx, next).
The initial context is copied before freezing; dropped keys count as conflicts.
* @ngwes/mini-fp 2.0.0 or later is now the required peer dependency.

## [1.2.1](https://github.com/ngwes/groucho-fp/compare/v1.2.0...v1.2.1) (2026-10-24)


### Bug Fixes

* require @ngwes/mini-fp 1.4.0 or later as the peer dependency ([0bf87aa](https://github.com/ngwes/groucho-fp/commit/0bf87aa0181fcea5674933b714cf48f06e4de40c))
* return a native promise from pipeline with every mini-fp version ([ae5fcf4](https://github.com/ngwes/groucho-fp/commit/ae5fcf4a11cea10c5ff8b18005d41d3ad259e7dd))

# [1.2.0](https://gitlab.com/nadir.gherbi1/groucho-fp/compare/v1.1.0...v1.2.0) (2026-04-17)


### Bug Fixes

* check steps export before default to handle ESM interop ([3d7eed0](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/3d7eed05ac147a20c2ccaff94a003e9dc94634f5))
* update mini-fp version to 1.4.0 and simplify error handling in Pipeline ([f40524f](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/f40524f913cbaa5c0a450bc4581f1841861c5022))


### Features

* add load step to load steps from provided paths ([e52b008](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/e52b008a79c4012b57bf3e49052b2bf6cfdf60b7))
* complete dynamic step loading implementation ([ecc74c1](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/ecc74c1f423031f1e8c7d85f36c4135fb89ddcda))
* export dynamic steps from index ([4f2cc20](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/4f2cc2065a8d14cad12249162eb6a899c952b7cc))

# [1.1.0](https://gitlab.com/nadir.gherbi1/groucho-fp/compare/v1.0.0...v1.1.0) (2026-04-09)


### Features

* replace old implementation with either based ([e68225d](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/e68225d5df1fcda105cd9c3f4bc9cbad1912888f))
* scaffold pipeline implementation ([15270e3](https://gitlab.com/nadir.gherbi1/groucho-fp/commit/15270e3eb3e50b625f4363a8a4221c2fcb85b882))
