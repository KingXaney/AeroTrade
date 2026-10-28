import {describe, expect, it} from 'vitest';
import {takeToken, type Bucket} from '@/lib/agent-world/bucket';
import {
    agentWorldCallbackUrl,
    agentWorldEnv,
    agentWorldOff,
    agentWorldOwnerEmails,
    agentWorldService,
    agentWorldUniverse,
    approvalMode,
    isAgentWorldOwner,
    paperclipAgentIdsFromEnv,
    paperclipSettings,
} from '@/lib/agent-world/env';

const SERVICE = {AGENT_WORLD_SERVICE_URL: 'https://desk.example.com/', AGENT_WORLD_SERVICE_SECRET: 's', LAB_OWNER_EMAILS: 'owner@example.com'};

describe('the trading agent world\'s environment', () => {
    it('names the deployment as a preview would share production\'s database', () => {
        expect(agentWorldEnv({VERCEL_ENV: 'production'})).toBe('production');
        expect(agentWorldEnv({VERCEL_ENV: 'preview'})).toBe('preview');
        expect(agentWorldEnv({})).toBe('development');
    });

    it('says why nothing runs: switched off, no service, or nobody to decide', () => {
        expect(agentWorldOff({...SERVICE, AGENT_WORLD_ENABLED: 'false'})).toBe('disabled');
        expect(agentWorldOff({LAB_OWNER_EMAILS: 'owner@example.com'})).toBe('unconfigured');
        expect(agentWorldOff({...SERVICE, LAB_OWNER_EMAILS: ''})).toBe('no-approver');
        expect(agentWorldOff({...SERVICE, LAB_OWNER_EMAILS: '', AGENT_WORLD_APPROVAL: 'auto'})).toBeNull();
        expect(agentWorldOff(SERVICE)).toBeNull();
        expect(agentWorldService(SERVICE)).toEqual({url: 'https://desk.example.com', secret: 's'});
    });

    it('lets its own owners act, else the lab\'s', () => {
        expect(agentWorldOwnerEmails({AGENT_WORLD_OWNER_EMAILS: 'A@x.com, b@x.com', LAB_OWNER_EMAILS: 'lab@x.com'})).toEqual(['a@x.com', 'b@x.com']);
        expect(isAgentWorldOwner('LAB@x.com', {LAB_OWNER_EMAILS: 'lab@x.com'})).toBe(true);
        expect(isAgentWorldOwner('other@x.com', {LAB_OWNER_EMAILS: 'lab@x.com'})).toBe(false);
        expect(isAgentWorldOwner(null, {LAB_OWNER_EMAILS: 'lab@x.com'})).toBe(false);
        expect(approvalMode({AGENT_WORLD_APPROVAL: 'AUTO'})).toBe('auto');
        expect(approvalMode({AGENT_WORLD_APPROVAL: 'whatever'})).toBe('owner');
    });

    it('reads the universe as tickers only, once each, at most ten', () => {
        expect(agentWorldUniverse({})).toEqual(['AAPL', 'MSFT', 'NVDA']);
        expect(agentWorldUniverse({AGENT_WORLD_UNIVERSE: 'nvda, brk.b, NVDA, $$$, 12AB'})).toEqual(['NVDA', 'BRK.B']);
        expect(agentWorldUniverse({AGENT_WORLD_UNIVERSE: 'A,B,C,D,E,F,G,H,I,J,K,L'})).toHaveLength(10);
    });

    it('sends events to this deployment\'s own address', () => {
        expect(agentWorldCallbackUrl({VERCEL_ENV: 'production'})).toBe('https://aerotrading.vercel.app/api/agent-world/events');
        expect(agentWorldCallbackUrl({BETTER_AUTH_URL: 'http://localhost:3000/'})).toBe('http://localhost:3000/api/agent-world/events');
        expect(agentWorldCallbackUrl({AGENT_WORLD_CALLBACK_ORIGIN: 'https://tunnel.example.com'})).toBe('https://tunnel.example.com/api/agent-world/events');
    });

    it('reads Paperclip only when all three of its settings are there', () => {
        expect(paperclipSettings({PAPERCLIP_URL: 'http://localhost:3100/', PAPERCLIP_API_KEY: 'k'})).toBeNull();
        expect(paperclipSettings({PAPERCLIP_URL: 'http://localhost:3100/', PAPERCLIP_API_KEY: 'k', PAPERCLIP_COMPANY_ID: 'c'}))
            .toEqual({url: 'http://localhost:3100', apiKey: 'k', companyId: 'c', boardUrl: 'http://localhost:3100'});
        expect(paperclipAgentIdsFromEnv({AGENT_WORLD_PAPERCLIP_AGENT_IDS: 'market=22222222-2222-4222-8222-000000000003, head-trader=22222222-2222-4222-8222-000000000001, wizard=x, trader=not a uuid'}))
            .toEqual({'market': '22222222-2222-4222-8222-000000000003', 'head-trader': '22222222-2222-4222-8222-000000000001'});
    });
});

describe('the live route\'s bucket', () => {
    it('lets a burst through, then a request a second at the rate, per key', () => {
        const buckets = new Map<string, Bucket>();
        const rate = {rate: 1, burst: 3};
        expect([0, 0, 0, 0].map(() => takeToken(buckets, 'u', 0, rate))).toEqual([true, true, true, false]);
        expect(takeToken(buckets, 'u', 999, rate)).toBe(false);
        expect(takeToken(buckets, 'u', 1100, rate)).toBe(true);
        expect(takeToken(buckets, 'v', 1100, rate)).toBe(true);
    });
});
