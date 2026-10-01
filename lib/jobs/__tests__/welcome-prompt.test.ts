import {describe, expect, it} from 'vitest';
import {buildWelcomePrompt, PERSONALIZED_WELCOME_EMAIL_PROMPT} from '@/lib/jobs/prompts';

const profile = {country: 'US', investmentGoals: 'Growth', riskTolerance: 'Medium', preferredIndustry: 'Technology'};
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('buildWelcomePrompt', () => {
    it('states each sign-up answer once, where the template asks for the profile', () => {
        const prompt = buildWelcomePrompt(profile);
        expect(prompt).not.toContain('{{userProfile}}');
        expect(prompt).toContain('- Country: US');
        expect(prompt).toContain('- Investment goals: Growth');
        expect(prompt).toContain('- Risk tolerance: Medium');
        expect(prompt).toContain('- Preferred industry: Technology');
        const [head] = PERSONALIZED_WELCOME_EMAIL_PROMPT.split('{{userProfile}}');
        expect(prompt.startsWith(head)).toBe(true);
    });

    it("keeps '$&', '$`' and \"$'\" in an answer literal instead of expanding them into the prompt", () => {
        const answer = "$& $` $'";
        const prompt = buildWelcomePrompt({...profile, investmentGoals: answer});
        expect(prompt).toContain(`- Investment goals: ${answer}`);
        expect(count(prompt, 'Generate highly personalized HTML content')).toBe(1);
        expect(prompt.length).toBe(buildWelcomePrompt(profile).length - 'Growth'.length + answer.length);
    });
});
