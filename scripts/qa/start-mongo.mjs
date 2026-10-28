// Throwaway MongoDB for local QA only; nothing persists beyond this process.
import {MongoMemoryServer} from 'mongodb-memory-server';

(async () => {
    // run.sh's MONGO_PORT (QA_MONGO_PORT), :27117 unless it was moved.
    const server = await MongoMemoryServer.create({instance: {port: Number(process.env.QA_MONGO_PORT ?? 27117), dbName: 'aerotrade'}});
    console.log('READY', server.getUri('aerotrade'));
    setInterval(() => {}, 1 << 30);
})().catch((e) => {
    console.error('FAILED', e);
    process.exit(1);
});
