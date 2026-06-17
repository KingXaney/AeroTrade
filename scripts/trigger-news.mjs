import { Inngest } from "inngest";

const inngest = new Inngest({ id: 'AlgoTest' });

async function test() {
    await inngest.send({
        name: 'app/send.daily.news',
        data: {}
    });
    console.log("Triggered 'app/send.daily.news' event locally.");
}

test().catch(console.error);
