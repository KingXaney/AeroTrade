import {notFound, redirect} from "next/navigation";
import {normalizeCode} from "@/lib/poker-night/code";
import {envOf} from "@/lib/poker-night/env";
import {tablePath} from "@/lib/poker-night/links";
import {getRoomByCodeCached} from "@/lib/poker-night/store";

// The table's address settled before anything streams. This layout sits outside the page's loading
// boundary (loading.tsx wraps only the page), so what it decides goes out as a real status: a code
// typed in lower case, or with a space or a dash, is a 307 to the upper-case one; anything that is
// not a code, and a table that is gone or never was, is a 404 (app/(play)/play/not-found.tsx, the
// parent segment's, since a layout's notFound() is caught above it). It reads the room through the
// request's cache, so the page's own read costs nothing more, and it never writes
// (lib/poker-night/__tests__/route-guard.test.ts). Any other failed read is the page's to report.
const TableCodeLayout = async ({children, params}: {children: React.ReactNode; params: Promise<{code: string}>}) => {
    const {code: raw} = await params;
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        // A malformed escape reads as typed.
    }
    const code = normalizeCode(decoded);
    if (code === null) notFound();
    if (code !== raw) redirect(tablePath(code));
    const read = await getRoomByCodeCached(envOf(), code);
    if (!read.ok && read.why === 'gone') notFound();
    return children;
};

export default TableCodeLayout;
