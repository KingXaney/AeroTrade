import type {Metadata} from "next";
import {requireUserId} from "@/lib/auth/session";
import EngineProbe from "@/components/poker/EngineProbe";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";

export const metadata: Metadata = {title: "Poker solver"};

// The worker spike: does a Web Worker build and run here? Replaced by the solver once it passes.
const PokerPage = async () => {
    await requireUserId();
    return (
        <div className="space-y-4">
            <PageTitle title="Poker solver"/>
            <Panel><EngineProbe/></Panel>
        </div>
    );
};

export default PokerPage;
