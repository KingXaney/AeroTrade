// Which deployment a request runs in: production and previews by VERCEL_ENV, everything else —
// a local server, the QA harness, a local production build, a value we do not know — development;
// and the feature's kill switch.

import {describe, expect, it} from 'vitest';
import {ENVS, envOf, isEnv, pokerNightEnabled} from '@/lib/poker-night/env';

describe('envOf', () => {
    it('reads production and previews from VERCEL_ENV', () => {
        expect(envOf({VERCEL_ENV: 'production'})).toBe('production');
        expect(envOf({VERCEL_ENV: 'preview'})).toBe('preview');
    });

    it('calls everything else development', () => {
        expect(envOf({})).toBe('development');
        expect(envOf({VERCEL_ENV: 'development'})).toBe('development');
        expect(envOf({VERCEL_ENV: ''})).toBe('development');
        expect(envOf({VERCEL_ENV: 'Production'})).toBe('development');
        expect(envOf({NODE_ENV: 'production'})).toBe('development');
    });

    it('knows the three envs and nothing else', () => {
        expect(ENVS).toEqual(['production', 'preview', 'development']);
        for (const env of ENVS) expect(isEnv(env)).toBe(true);
        expect(isEnv('staging')).toBe(false);
        expect(isEnv(undefined)).toBe(false);
    });
});

describe('pokerNightEnabled', () => {
    it('is on unless POKER_NIGHT_ENABLED says false', () => {
        expect(pokerNightEnabled({})).toBe(true);
        expect(pokerNightEnabled({POKER_NIGHT_ENABLED: ''})).toBe(true);
        expect(pokerNightEnabled({POKER_NIGHT_ENABLED: 'true'})).toBe(true);
        expect(pokerNightEnabled({POKER_NIGHT_ENABLED: 'false'})).toBe(false);
        expect(pokerNightEnabled({POKER_NIGHT_ENABLED: ' FALSE '})).toBe(false);
    });
});
