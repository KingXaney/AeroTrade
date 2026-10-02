'use client';

import {useEffect} from "react";
import {useRouter} from "next/navigation";

// /learn#max-drawdown is an address the app has handed out for a long time — ⌘K, Today's
// lesson, the daily email — and the server never sees a hash. On any tab but the glossary, a
// hash sends the reader to the glossary tab with it, where the entry is.
const GlossaryHashRedirect = ({onGlossary}: {onGlossary: boolean}) => {
    const router = useRouter();
    useEffect(() => {
        const hash = window.location.hash;
        if (!onGlossary && hash.length > 1) router.replace(`/learn?tab=glossary${hash}`);
    }, [onGlossary, router]);
    return null;
};

export default GlossaryHashRedirect;
