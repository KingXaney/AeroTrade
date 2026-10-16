'use client';

import {useEffect} from "react";
import {useRouter} from "next/navigation";

// /learn#max-drawdown and /learn?tab=glossary are addresses the app handed out for a long time —
// ⌘K, Today's lesson, the daily email — from when the glossary was a tab of /learn. The server
// never sees a hash, so the client sends them to the glossary's own page with the hash kept
// (a server redirect would drop it). With no hash to follow, an account the lab is not open to
// goes to `fallback` (the games); the owner stays on the lab. Listens for a hash that changes
// on a page already open (⌘K from /learn itself). The lab's own anchors — the list's Open → to
// #lab-problem, #lab-review or #lab-digest, a digest's [n] to #paper-… — are not glossary terms:
// the owner stays on the page; anyone else still goes to `fallback`.
const LearnRedirect = ({fallback, legacyGlossaryTab}: {fallback: string | null; legacyGlossaryTab: boolean}) => {
    const router = useRouter();
    useEffect(() => {
        const follow = () => {
            const hash = window.location.hash;
            if (hash.length > 1 && !/^#(lab-|paper-)/.test(hash)) router.replace(`/glossary${hash}`);
            else if (legacyGlossaryTab) router.replace('/glossary');
            else if (fallback) router.replace(fallback);
        };
        follow();
        window.addEventListener('hashchange', follow);
        return () => window.removeEventListener('hashchange', follow);
    }, [fallback, legacyGlossaryTab, router]);
    return null;
};

export default LearnRedirect;
