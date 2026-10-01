// What every prompt builder fills its template with. Import-free.

// Substituted through a replacer function rather than a replacement string: scraped headlines,
// reasons and user answers reach this JSON, and a "$&" or "$`" in one would otherwise be
// expanded by String.replace and quietly rewrite the prompt around it.
export const injectJson = (template: string, token: string, value: unknown, indent = 1): string =>
    template.replace(token, () => JSON.stringify(value, null, indent));
