// Throwaway MongoDB for local QA only; nothing persists beyond this process.
import {MongoMemoryServer} from 'mongodb-memory-server';

(async () => {
    const server = await MongoMemoryServer.create({instance: {port: 27117, dbName: 'aerotrade'}});
    console.log('READY', server.getUri('aerotrade'));
    setInterval(() => {}, 1 << 30);
})().catch((e) => {
    console.error('FAILED', e);
    process.exit(1);
});
