import type {Metadata} from "next";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {unsubscribeSecret, verifyUnsubscribeToken} from "@/lib/email/unsubscribe";
import {UNSUBSCRIBE_COPY} from "@/lib/learn/copy/email";

export const metadata: Metadata = {title: UNSUBSCRIBE_COPY.title, robots: {index: false, follow: false}};

type UnsubscribePageProps = {searchParams: Promise<{u?: string; t?: string; done?: string; invalid?: string; failed?: string}>};

// Where the daily brief's footer link lands (lib/email/unsubscribe.ts). Public: the reader is
// usually signed out (proxy.ts lets the path through). The page reads the link and changes
// nothing; its one button posts to /api/email/unsubscribe, which does, and sends the reader
// back here with what happened.
const UnsubscribePage = async ({searchParams}: UnsubscribePageProps) => {
    const {u, t, done, invalid, failed} = await searchParams;
    const signed = verifyUnsubscribeToken(u, t, unsubscribeSecret());

    if (done) {
        return (
            <>
                <h1 className="form-title">{UNSUBSCRIBE_COPY.doneTitle}</h1>
                <p className="text-sm text-fg" data-unsubscribe="done">{UNSUBSCRIBE_COPY.doneBody}</p>
                <p className="pt-4 text-sm text-fg-muted">
                    <Link href="/settings?tab=notifications" className="footer-link">{UNSUBSCRIBE_COPY.settingsLink}</Link>
                </p>
            </>
        );
    }
    if (failed) {
        return (
            <>
                <h1 className="form-title">{UNSUBSCRIBE_COPY.title}</h1>
                <p role="alert" className="text-sm text-fg" data-unsubscribe="failed">{UNSUBSCRIBE_COPY.failedBody}</p>
            </>
        );
    }
    if (invalid || !signed) {
        return (
            <>
                <h1 className="form-title">{UNSUBSCRIBE_COPY.title}</h1>
                <p role="alert" className="text-sm text-fg" data-unsubscribe="invalid">{UNSUBSCRIBE_COPY.invalidBody}</p>
                <p className="pt-4 text-sm text-fg-muted">
                    <Link href="/settings?tab=notifications" className="footer-link">{UNSUBSCRIBE_COPY.settingsLink}</Link>
                </p>
            </>
        );
    }
    return (
        <>
            <h1 className="form-title">{UNSUBSCRIBE_COPY.title}</h1>
            <p className="text-sm text-fg">{UNSUBSCRIBE_COPY.body}</p>
            <form method="post" action={`/api/email/unsubscribe?u=${encodeURIComponent(u ?? '')}&t=${encodeURIComponent(t ?? '')}`} className="pt-5">
                <Button type="submit" className="yellow-btn w-full" data-unsubscribe="confirm">{UNSUBSCRIBE_COPY.button}</Button>
            </form>
        </>
    );
};

export default UnsubscribePage;
