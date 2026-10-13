import type {Metadata} from "next";
import {requireUserId} from "@/lib/auth/session";
import {STRATEGIES_DISCLAIMER} from "@/lib/strategies/catalog";
import {GLOSSARY_PAGE_COPY} from "@/lib/learn/copy/learn";
import GlossaryGroups from "@/components/learn/GlossaryGroups";
import MicroLabel from "@/components/primitives/MicroLabel";
import PageTitle from "@/components/primitives/PageTitle";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Glossary"};

// Every definition the app shows, for every account: a page of the Learn section, reached from
// its tab, from ⌘K and from every /learn#term address the app handed out before it existed
// (components/learn/LearnRedirect sends those here).
const GlossaryPage = async () => {
    await requireUserId();
    return (
        <div className="space-y-4">
            <PageTitle title={GLOSSARY_PAGE_COPY.title} subtitle={GLOSSARY_PAGE_COPY.subtitle} note={GLOSSARY_PAGE_COPY.note}/>
            <GlossaryGroups/>
            <MicroLabel as="p" className="text-center">
                {STRATEGIES_DISCLAIMER}
            </MicroLabel>
        </div>
    );
};

export default GlossaryPage;
