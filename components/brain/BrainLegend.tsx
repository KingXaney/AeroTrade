import Panel from "@/components/primitives/Panel";
import Disclosure from "@/components/primitives/Disclosure";
import {brainLegend} from "@/lib/brain/legend";

// Under System Status on /brain: how the brain weighs the news and how the Navigator scores
// and trades, every figure read from the constants the code runs on (lib/brain/legend.ts).
// Reference prose, so it stays collapsed (invariant 8); mechanism only (invariant 12).
const BrainLegend = () => {
    const legend = brainLegend();
    return (
        <Panel id="brain-legend" pad={4}>
            <Disclosure summary={legend.summary}>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {legend.sections.map((section) => (
                        <div key={section.heading} className="min-w-0">
                            <h3 className="font-heading text-xs font-semibold text-fg">{section.heading}</h3>
                            <ul className="mt-1 space-y-1">
                                {section.lines.map((line) => (
                                    <li key={line} className="text-xs text-fg-muted leading-relaxed">{line}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </Disclosure>
        </Panel>
    );
};

export default BrainLegend;
