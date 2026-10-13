import type {ReactNode} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {cn} from "@/lib/utils";

// The lab's authored markdown — a unit's sections, a card's two faces, a problem and its worked
// solution — as DOM: GFM tables, fenced code, and KaTeX maths rendered here on the server, so no
// KaTeX JavaScript ships to the browser and the stylesheet loads only with a lab page. The text
// is the repo's own (lib/learn/copy/lab), never a model's, which is why links are allowed here
// and not in components/primitives/SafeMarkdown. Images are dropped all the same. Typography is
// .lab-prose in app/globals.css.
const COMPONENTS = {
    img: () => null,
    a: ({href, children}: {href?: string; children?: ReactNode}) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{children}</a>
    ),
};

const LabMarkdown = ({children, className}: {children: string; className?: string}) => (
    <div className={cn('lab-prose', className)}>
        <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={COMPONENTS}>{children}</ReactMarkdown>
    </div>
);

export default LabMarkdown;
