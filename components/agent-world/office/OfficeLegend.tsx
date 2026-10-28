import Disclosure from "@/components/primitives/Disclosure";
import Panel from "@/components/primitives/Panel";
import {officeLegend} from "@/lib/agent-world/office-legend";

// At the foot of the office: what a seat is doing, what moves on the floor, the clock it keeps and
// how to read it, every figure from the constants (lib/agent-world/office-legend.ts). Reference
// prose, so it stays collapsed (invariant 8); mechanism only (invariant 12).
const OfficeLegend = () => {
    const legend = officeLegend();
    return (
        <Panel id="agent-world-office-legend" pad={4}>
            <Disclosure summary={legend.summary}>
                <div className="mt-3 space-y-4">
                    {legend.sections.map((section) => (
                        <div key={section.heading} className="min-w-0">
                            <h3 className="font-heading text-xs font-semibold text-fg">{section.heading}</h3>
                            <ul className="mt-1 space-y-1">
                                {section.lines.map((line) => (
                                    <li key={line} className="text-xs leading-relaxed text-fg-muted">{line}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </Disclosure>
        </Panel>
    );
};

export default OfficeLegend;
