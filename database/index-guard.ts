// Building a model's indexes before a write that relies on one, safely.
//
// Never `await Model.init()` for this. Mongoose calls init() when a model is compiled, and with
// `bufferCommands: false` (database/mongoose.ts) a model compiled while the connection is still
// opening has an init() that is REJECTED FOR GOOD: every later await of it throws, on every
// request, until the process is replaced. A cold start that imports the model before the
// connection is up is exactly that case.
//
// indexGuard(model) asks for the indexes itself, once the caller has connected (a no-op where
// they exist), shares one attempt between concurrent callers, and forgets a failure so the next
// call tries again. It answers whether the indexes are there; it never throws.

type Indexed = {modelName: string; createIndexes: () => Promise<unknown>};

export const indexGuard = (model: Indexed): (() => Promise<boolean>) => {
    let building: Promise<boolean> | undefined;
    return () => (building ??= model.createIndexes().then(
        () => true,
        (error: unknown) => {
            building = undefined;
            console.error(`The ${model.modelName} indexes could not be built:`, error);
            return false;
        },
    ));
};
