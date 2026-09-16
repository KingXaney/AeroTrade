'use client';

import ReactMarkdown from "react-markdown";
import {cn} from "@/lib/utils";

// The one place model-written markdown is turned into DOM.
//
// AGENTS.md invariant 4: LLM output is untrusted. That matters more here than it looks,
// because the model is fed untrusted input — getMarketNews, getTopicFeed and
// getBrainDigest hand it headlines and URLs scraped from Google News and RSS. A
// prompt-injected headline can talk the model into emitting a clickable link or a remote
// <img> into the user's authenticated page. Text stripping upstream handles the common
// inline form, but markdown has more ways to make a link than a regex should be trusted
// with — reference definitions, protocol-relative targets, autolinks, images. Rendering
// is the guarantee.
//
// It also carries the list/paragraph spacing. ChatMessage used to reach for Tailwind's
// `prose` classes, but @tailwindcss/typography is not installed and there is no @plugin
// line in globals.css — so every bulleted answer rendered as one run-together block.
const MARKDOWN_COMPONENTS = {
    a: ({children}: {children?: React.ReactNode}) => <span>{children}</span>,
    img: () => null,
};

type Props = {
    children: string;
    className?: string;
};

const SafeMarkdown = ({children, className}: Props) => (
    <div className={cn('[&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:pl-4 [&_li]:list-disc [&_ol>li]:list-decimal [&_strong]:font-semibold [&_strong]:text-fg [&_code]:text-[0.9em] [&_*:last-child]:mb-0', className)}>
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>{children}</ReactMarkdown>
    </div>
);

export default SafeMarkdown;
