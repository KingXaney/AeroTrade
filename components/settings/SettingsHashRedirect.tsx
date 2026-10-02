'use client';

import {useEffect} from "react";
import {useRouter} from "next/navigation";

// /settings#notifications is the address the daily email's footer has always used, and the
// server never sees a hash. When the hash names a section other than the open one, go to it —
// on arrival, and when only the hash changes on a page already open.
const SettingsHashRedirect = ({sections, active}: {sections: readonly string[]; active: string}) => {
    const router = useRouter();
    useEffect(() => {
        const follow = () => {
            const wanted = window.location.hash.slice(1);
            if (wanted && wanted !== active && sections.includes(wanted)) router.replace(`/settings?tab=${wanted}`);
        };
        follow();
        window.addEventListener('hashchange', follow);
        return () => window.removeEventListener('hashchange', follow);
    }, [sections, active, router]);
    return null;
};

export default SettingsHashRedirect;
