// Who may link Alpaca and how the connection reads the environment: paper unless both live
// switches are on, nothing without both keys, the owners from BROKER_OWNER_EMAILS or the lab's.

import {describe, expect, it} from 'vitest';
import {ALPACA_LIVE_URL, ALPACA_PAPER_URL, alpacaSettings, brokerOwnerEmails, isBrokerOwner} from '@/lib/broker/config';

const keys = {ALPACA_API_KEY_ID: 'PKTEST', ALPACA_API_SECRET_KEY: 'secret'};

describe('alpacaSettings', () => {
    it('is not configured without both keys', () => {
        expect(alpacaSettings({})).toEqual({configured: false, mode: 'paper', baseUrl: null, blocked: 'no-keys'});
        expect(alpacaSettings({ALPACA_API_KEY_ID: 'x'}).blocked).toBe('no-keys');
        expect(alpacaSettings({ALPACA_API_SECRET_KEY: 'x', ALPACA_API_KEY_ID: '  '}).blocked).toBe('no-keys');
    });

    it('trades paper by default, at the paper address', () => {
        expect(alpacaSettings(keys)).toEqual({configured: true, mode: 'paper', baseUrl: ALPACA_PAPER_URL, blocked: null});
        expect(alpacaSettings({...keys, ALPACA_MODE: 'PAPER'}).mode).toBe('paper');
        expect(alpacaSettings({...keys, ALPACA_MODE: 'something'}).mode).toBe('paper');
    });

    it('locks live unless both live switches are on', () => {
        expect(alpacaSettings({...keys, ALPACA_MODE: 'live'})).toEqual({configured: true, mode: 'live', baseUrl: null, blocked: 'live-locked'});
        expect(alpacaSettings({...keys, ALPACA_LIVE_ENABLED: 'yes'}).mode).toBe('paper');
        expect(alpacaSettings({...keys, ALPACA_MODE: 'live', ALPACA_LIVE_ENABLED: 'true'}).blocked).toBe('live-locked');
        expect(alpacaSettings({...keys, ALPACA_MODE: 'live', ALPACA_LIVE_ENABLED: 'yes'})).toEqual({configured: true, mode: 'live', baseUrl: ALPACA_LIVE_URL, blocked: null});
    });

    it('takes a test address only in paper mode', () => {
        expect(alpacaSettings({...keys, ALPACA_BASE_URL: 'http://localhost:8788/'}).baseUrl).toBe('http://localhost:8788');
        expect(alpacaSettings({...keys, ALPACA_MODE: 'live', ALPACA_LIVE_ENABLED: 'yes', ALPACA_BASE_URL: 'http://localhost:8788'}).baseUrl).toBe(ALPACA_LIVE_URL);
    });
});

describe('the broker owner', () => {
    it('is BROKER_OWNER_EMAILS when set, else the lab owners, compared lower-cased', () => {
        expect(brokerOwnerEmails({BROKER_OWNER_EMAILS: 'A@x.com, b@y.com', LAB_OWNER_EMAILS: 'lab@z.com'})).toEqual(['a@x.com', 'b@y.com']);
        expect(brokerOwnerEmails({LAB_OWNER_EMAILS: 'Lab@Z.com'})).toEqual(['lab@z.com']);
        expect(brokerOwnerEmails({})).toEqual([]);
        expect(isBrokerOwner('LAB@z.com', {LAB_OWNER_EMAILS: 'lab@z.com'})).toBe(true);
        expect(isBrokerOwner('other@z.com', {LAB_OWNER_EMAILS: 'lab@z.com'})).toBe(false);
        expect(isBrokerOwner(null, {LAB_OWNER_EMAILS: 'lab@z.com'})).toBe(false);
        expect(isBrokerOwner('', {})).toBe(false);
    });
});
