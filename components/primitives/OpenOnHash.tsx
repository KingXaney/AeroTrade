'use client';

import {useEffect} from "react";

// Opens the <details> `id` when the page's hash is `hash`: on arrival (/learn#lab-problem, a reload)
// and on each change — the list's Open → is a plain anchor, so the browser's fragment navigation
// fires hashchange; a Link to a hash goes through the router's pushState and fires nothing. Renders
// nothing and never closes it: folding is the reader's own press on the summary. Rendered by
// components/primitives/Disclosure for its `openOnHash`.
const OpenOnHash = ({hash, id}: {hash: string; id: string}) => {
    useEffect(() => {
        const follow = () => {
            if (window.location.hash !== hash) return;
            const details = document.getElementById(id);
            if (details instanceof HTMLDetailsElement) details.open = true;
        };
        follow();
        window.addEventListener('hashchange', follow);
        return () => window.removeEventListener('hashchange', follow);
    }, [hash, id]);
    return null;
};

export default OpenOnHash;
