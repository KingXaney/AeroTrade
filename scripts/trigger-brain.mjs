import { Inngest } from "inngest";

const inngest = new Inngest({ id: 'AlgoTest' });

async function test() {
    await inngest.send({
        name: 'app/update.news.brain',
        data: {}
    });
    console.log("Triggered 'app/update.news.brain' event locally.");
}

test().catch(console.error);
