'use client';

import {useEffect} from "react";
import {useRouter} from "next/navigation";

// /learn#max-drawdown is an address the app has handed out for a long time — ⌘K, Today's
// lesson, the daily email — and the server never sees a hash. On any tab but the glossary, a
// hash sends the reader to the glossary tab with it, where the entry is: on arrival, and when
// only the hash changes on a page already open (⌘K from /learn itself).
const GlossaryHashRedirect = ({onGlossary}: {onGlossary: boolean}) => {
    const router = useRouter();
    useEffect(() => {
        const follow = () => {
            const hash = window.location.hash;
            if (!onGlossary && hash.length > 1) router.replace(`/learn?tab=glossary${hash}`);
        };
        follow();
        window.addEventListener('hashchange', follow);
        return () => window.removeEventListener('hashchange', follow);
    }, [onGlossary, router]);
    return null;
};

export default GlossaryHashRedirect;
