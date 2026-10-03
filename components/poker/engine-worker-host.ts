// The one place the poker worker is created. It sits beside engine.worker.ts so the URL below
// stays relative to its own folder.
export const createEngineWorker = (): Worker =>
    new Worker(new URL('./engine.worker.ts', import.meta.url), {name: 'aerotrade-poker'});
