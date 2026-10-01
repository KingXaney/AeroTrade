// A brain entity as the pages, widgets and chat read it.

export type BrainEntityType = 'ticker' | 'sector' | 'theme';

export type BrainEntitySummary = {
    key: string;
    type: BrainEntityType;
    displayName: string;
    weightFast: number;
    weightSlow: number;
    sentimentFast: number;        // derived avg, −1..1
    sentimentSlow: number;
    thesisSince: number | null;   // epoch ms when the slow weight sustained above threshold
    lastSeenAt: number;           // epoch ms
};
