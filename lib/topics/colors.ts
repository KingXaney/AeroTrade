// The colours a topic can be given in the composer. These are stored user data, not theme
// styling: the picked hex is saved on the Topic document (`normalize` holds it to #rrggbb)
// and every topic dot renders that stored value inline, in every palette. That is why they
// are hex here and not semantic tokens — a theme change must not recolour a saved topic.
export const TOPIC_COLORS = ['#7df4ff', '#a6e3a1', '#f9e2af', '#fab387', '#f38ba8', '#cba6f7', '#89b4fa', '#94e2d5'] as const;
