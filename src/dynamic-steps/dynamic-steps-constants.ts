export const constants = {
    // Step files only: .ts/.js/.mjs/.cjs, minus declaration (.d.ts), test (.test.*) and spec (.spec.*) files.
    filePatterns: /^(?!.*\.(?:d|test|spec)\.[^.]+$).+\.(?:ts|js|mjs|cjs)$/,
}
