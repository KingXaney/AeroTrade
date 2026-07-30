import { Inngest } from "inngest";

const inngest = new Inngest({ id: 'AlgoTest' });

async function test() {
    await inngest.send({
        name: 'app/record.daily.snapshots',
        data: {}
    });
    console.log("Triggered 'app/record.daily.snapshots' event locally.");
}

test().catch(console.error);
