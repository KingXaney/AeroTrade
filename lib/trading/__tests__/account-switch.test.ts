import {describe, expect, it} from 'vitest';
import {switchHref, switchView} from '@/lib/trading/account-switch';

describe('switchHref', () => {
    it('is nothing when the address names no account: the page is asked for again as it is', () => {
        expect(switchHref('/portfolio', '')).toBeNull();
        expect(switchHref('/trade', 'symbol=NVDA&view=heatmap')).toBeNull();
    });

    it('drops ?account= and keeps every other parameter, because the parameter outranks the cookie the switch writes', () => {
        expect(switchHref('/portfolio', 'account=abc')).toBe('/portfolio');
        expect(switchHref('/trade', 'symbol=NVDA&account=abc&view=heatmap')).toBe('/trade?symbol=NVDA&view=heatmap');
        expect(switchHref('/trade', '?account=abc&symbol=BRK.B')).toBe('/trade?symbol=BRK.B');
        expect(switchHref('/dashboard', 'account=')).toBe('/dashboard');
    });
});

describe('switchView', () => {
    it('shows the page\'s own account while nothing is being opened', () => {
        expect(switchView('a', null)).toEqual({shownId: 'a', pending: false});
    });

    it('shows the account being opened at once, and is pending until the page is that account', () => {
        expect(switchView('a', 'b')).toEqual({shownId: 'b', pending: true});
        expect(switchView('b', 'b')).toEqual({shownId: 'b', pending: false});
    });
});
