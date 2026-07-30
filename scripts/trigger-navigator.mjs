import { Inngest } from "inngest";

const inngest = new Inngest({ id: 'AlgoTest' });

async function test() {
    await inngest.send({
        name: 'app/run.ai.navigator',
        data: {}
    });
    console.log("Triggered 'app/run.ai.navigator' event locally.");
}

test().catch(console.error);
