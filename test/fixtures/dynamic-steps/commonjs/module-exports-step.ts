// A CommonJS step file: jiti hands the loader the function itself, with no default property.
// Only its shape matters to the test, so it does not build an Either.
module.exports = async (ctx: { value: string }) => ctx;
