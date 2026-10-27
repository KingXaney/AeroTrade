// The pure side of the Paperclip company: role lookup by name, the approval stage, the org tree,
// budget shares and every text the session writes into the company.

import {describe, expect, it} from 'vitest';
import {PAPERCLIP_DESKS, ROLES} from '@/lib/agent-world/config';
import type {PaperclipAgent} from '@/lib/agent-world/paperclip';
import {
    agentIdsByName,
    blockedComment,
    budgetShare,
    decisionComment,
    executionPolicyFor,
    fillsComment,
    issueBoardUrl,
    issueDescription,
    issueTitle,
    lapsedComment,
    noOrdersComment,
    orgTree,
    type OrgNode,
} from '@/lib/agent-world/paperclip-view';
import type {SessionFill} from '@/lib/agent-world/types';
import {findBanned} from '@/lib/learn/banned';

const agent = (id: string, name: string, reportsTo: string | null = null, extra: Partial<PaperclipAgent> = {}): PaperclipAgent => ({
    id, name, role: 'general', title: null, status: 'idle', reportsTo, budgetMonthlyCents: 100, spentMonthlyCents: 0, ...extra,
});

// The tree as "depth name" lines, in drawing order.
const lines = (nodes: OrgNode[]): string[] => nodes.flatMap((node) => [`${node.depth} ${node.agent.name}`, ...lines(node.children)]);

describe('agentIdsByName', () => {
    const company = [
        agent('h', 'Head Trader'),
        agent('x', 'execution desk'),
        ...ROLES.map((role, i) => agent(`r${i}`, role.paperclip.toUpperCase())),
    ];

    it('finds every desk and role by its name, ignoring case', () => {
        const ids = agentIdsByName(company);
        expect(ids['head-trader']).toBe('h');
        expect(ids['execution-desk']).toBe('x');
        ROLES.forEach((role, i) => expect(ids[role.id]).toBe(`r${i}`));
        expect(Object.keys(ids)).toHaveLength(ROLES.length + Object.keys(PAPERCLIP_DESKS).length);
    });

    it('lets a pinned id win and leaves out a name nobody goes by', () => {
        const ids = agentIdsByName([agent('h', 'Head trader'), agent('m', 'Market analyst')], {'head-trader': 'pinned-head', bull: 'pinned-bull'});
        expect(ids).toEqual({'head-trader': 'pinned-head', bull: 'pinned-bull', market: 'm'});
    });

    it('never matches a terminated agent, so a replacement under the same name answers', () => {
        const ids = agentIdsByName([agent('old', 'Trader', null, {status: 'terminated'}), agent('new', 'trader')]);
        expect(ids.trader).toBe('new');
        expect(agentIdsByName([agent('old', 'Trader', null, {status: 'terminated'})]).trader).toBeUndefined();
    });
});

describe('executionPolicyFor', () => {
    it('holds an owner-approved session for the Execution desk in one approval stage', () => {
        expect(executionPolicyFor('owner', 'desk-1')).toEqual({
            mode: 'normal', commentRequired: true,
            stages: [{type: 'approval', approvalsNeeded: 1, participants: [{type: 'agent', agentId: 'desk-1'}]}],
        });
    });

    it('opens no stage in auto mode or without a desk', () => {
        expect(executionPolicyFor('auto', 'desk-1')).toBeNull();
        expect(executionPolicyFor('owner', null)).toBeNull();
    });
});

describe('orgTree', () => {
    const company = [
        agent('pm', 'Portfolio manager', 'head'),
        agent('rm', 'Research manager', 'head'),
        agent('head', 'Head trader'),
        agent('ra', 'Aggressive risk analyst', 'pm'),
        agent('desk', 'Execution desk', 'head'),
        agent('mk', 'Market analyst', 'rm'),
        agent('bu', 'Bull researcher', 'rm'),
    ];

    it('draws the reporting tree with every level sorted by name', () => {
        expect(lines(orgTree(company))).toEqual([
            '0 Head trader',
            '1 Execution desk',
            '1 Portfolio manager',
            '2 Aggressive risk analyst',
            '1 Research manager',
            '2 Bull researcher',
            '2 Market analyst',
        ]);
    });

    it('is the same tree whatever order the agents arrive in', () => {
        expect(orgTree([...company].reverse())).toEqual(orgTree(company));
    });

    it('draws an agent with an unknown manager as a root', () => {
        expect(lines(orgTree([agent('a', 'Trader', 'gone'), agent('b', 'Bear researcher')]))).toEqual(['0 Bear researcher', '0 Trader']);
    });

    it('draws the agents of a reporting loop as roots, and their reports under them', () => {
        const loop = [agent('a', 'Alpha', 'b'), agent('b', 'Beta', 'a'), agent('c', 'Gamma', 'a'), agent('s', 'Self', 's')];
        expect(lines(orgTree(loop))).toEqual(['0 Alpha', '1 Gamma', '0 Beta', '0 Self']);
        expect(lines(orgTree(loop))).toHaveLength(loop.length);
    });

    it('is empty for no agents', () => {
        expect(orgTree([])).toEqual([]);
    });
});

describe('budgetShare', () => {
    it('is the spent fraction of the cap, past 1 when over it', () => {
        expect(budgetShare(50, 200)).toBe(0.25);
        expect(budgetShare(300, 200)).toBe(1.5);
        expect(budgetShare(-5, 200)).toBe(0);
    });

    it('is null without a cap or a number', () => {
        expect(budgetShare(10, 0)).toBeNull();
        expect(budgetShare(10, -1)).toBeNull();
        expect(budgetShare(Number.NaN, 100)).toBeNull();
        expect(budgetShare(10, Number.POSITIVE_INFINITY)).toBeNull();
    });
});

describe('issueBoardUrl', () => {
    it('routes an issue under its company prefix', () => {
        expect(issueBoardUrl('https://board.example/', 'TRA-12')).toBe('https://board.example/TRA/issues/TRA-12');
        expect(issueBoardUrl('http://127.0.0.1:3100', 'TRA-1')).toBe('http://127.0.0.1:3100/TRA/issues/TRA-1');
    });
});

const clean = (text: string) => {
    expect(text).not.toMatch(/undefined|NaN|null|\[object/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('the issue the session opens', () => {
    it('is titled by its week, or by its day when it was asked for by hand', () => {
        const symbols = ['AAPL', 'MSFT', 'NVDA'];
        expect(issueTitle({kind: 'weekly', weekKey: '2026-10-26', today: '2026-10-27', symbols})).toBe('Week of 2026-10-26: 3 symbols');
        expect(issueTitle({kind: 'manual', weekKey: '2026-10-26', today: '2026-10-27', symbols: ['AAPL']})).toBe('Manual session 2026-10-27: 1 symbol');
        expect(issueTitle({kind: 'preview', weekKey: '2026-10-26', today: '2026-10-27', symbols})).toBe('Preview session 2026-10-27: 3 symbols');
    });

    it('describes the session, who decides, and the costs, in paragraphs', () => {
        const owner = issueDescription({sessionId: 'aw-2026-10-26', symbols: ['AAPL', 'MSFT', 'NVDA'], approval: 'owner'});
        expect(owner).toContain('Session aw-2026-10-26 rates AAPL, MSFT and NVDA,');
        expect(owner).toContain("the owner's decision on AeroTrade");
        expect(owner.split('\n\n')).toHaveLength(4);
        const auto = issueDescription({sessionId: 'aw-2026-10-26-manual-20261027-0930', symbols: ['AAPL'], approval: 'auto'});
        expect(auto).toContain('rates AAPL,');
        expect(auto).toContain('without a pause');
        clean(owner);
        clean(auto);
    });
});

describe('the comments the Execution desk leaves', () => {
    const at = Date.UTC(2026, 9, 27, 14);
    const fill = (extra: Partial<SessionFill>): SessionFill => ({symbol: 'AAPL', side: 'buy', quantity: 10, executed: true, price: 150, message: null, at, ...extra});

    it('names who decided, or says the approval was automatic', () => {
        expect(decisionComment('approved', 'owner@example.com')).toBe('Approved by owner@example.com on AeroTrade.');
        expect(decisionComment('declined', 'owner@example.com')).toBe('Declined by owner@example.com on AeroTrade, so nothing was traded.');
        expect(decisionComment('approved', 'auto')).toBe('Approved on AeroTrade without a pause, as the approval mode is auto.');
        expect(decisionComment('declined', '  ')).toBe('Declined on AeroTrade, so nothing was traded.');
    });

    it('says what reached the paper account and what did not', () => {
        expect(fillsComment([fill({}), fill({symbol: 'MSFT', side: 'sell', quantity: 5, price: 300.5})]))
            .toBe('The paper account bought 10 AAPL at $150.00 and sold 5 MSFT at $300.50.');
        expect(fillsComment([fill({}), fill({symbol: 'NVDA', quantity: 3, executed: false, price: null, message: '  no live\nprice '})]))
            .toBe('The paper account bought 10 AAPL at $150.00. 1 order did not fill: NVDA, 3 shares to buy (no live price).');
        expect(fillsComment([fill({executed: false, price: null, message: null}), fill({symbol: 'MSFT', side: 'sell', quantity: 1, executed: false, message: 'market closed'})]))
            .toBe('No order reached the paper account. 2 orders did not fill: AAPL, 10 shares to buy; MSFT, 1 share to sell (market closed).');
        expect(fillsComment([])).toBe('No order reached the paper account.');
        expect(fillsComment([fill({price: null})])).toBe('The paper account bought 10 AAPL.');
    });

    it('keeps a long refusal to one short line', () => {
        const long = fillsComment([fill({executed: false, message: 'x'.repeat(500)})]);
        expect(long.length).toBeLessThan(300);
        expect(long).toContain('…');
    });

    it('explains a stop, a lapse and a week with nothing to decide', () => {
        expect(blockedComment('service refused (HTTP 503)')).toBe('The session stopped before any order was decided (service refused (HTTP 503)), so nothing was traded.');
        expect(blockedComment('  ')).toBe('The session stopped before any order was decided, so nothing was traded.');
        expect(lapsedComment()).toBe('The session lapsed with no decision, so nothing was traded.');
        expect(noOrdersComment()).toBe('Every rating kept the book as it is, so there was no order to decide on.');
    });

    it('holds every comment to the copy tier', () => {
        for (const text of [
            decisionComment('approved', 'owner@example.com'), decisionComment('declined', 'owner@example.com'), decisionComment('approved', 'auto'),
            fillsComment([fill({}), fill({symbol: 'MSFT', side: 'sell', executed: false, message: 'no live price'})]), fillsComment([]),
            blockedComment('no answer from the service in 48m'), lapsedComment(), noOrdersComment(),
        ]) {
            clean(text);
        }
    });
});
