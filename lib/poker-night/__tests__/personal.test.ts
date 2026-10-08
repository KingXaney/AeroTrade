// The personal look and what a browser keeps: every field whitelisted on its own (an unknown card
// back or a string where a switch goes costs only that field), the kept value read safely from
// anything localStorage may hold, a change laid over it field by field without losing what a later
// version added, the browser's own changes laid over an account's saved look, and the schemas the
// lobby's save is held to.

import {describe, expect, it} from 'vitest';
import {CARD_BACK_IDS, CARD_FACE_IDS, CHIP_SET_IDS} from '@/lib/poker-night/looks';
import {
    afterAccountSave, DEFAULT_PERSONAL_LOOK, effectiveLook, EMPTY_ME, lookDiffers, ME_STORAGE_KEY, nextStoredMe, parseStoredMe, PERSONAL_CHOICES, PERSONAL_KEYS, PERSONAL_SWITCHES,
    personalDiff, personalPatchOf, PersonalLookSchema, resolvePersonalLook, samePersonalLook, TableLookSchema, type PersonalLook,
} from '@/lib/poker-night/personal';

const avatar = 'v1:owl:sky:ring:star';

describe('the personal look', () => {
    it('starts on the defaults: the red back, large faces, two colours, classic chips, everything on but peek and muted emotes', () => {
        expect(DEFAULT_PERSONAL_LOOK).toEqual({
            cardBack: 'classic-red', cardFace: 'large', fourColour: false, chips: 'classic',
            sound: true, buzz: true, keepAwake: true, shortcuts: true, handHints: true, peek: false, muteEmotes: false, allowAsks: true,
        });
        expect(Object.isFrozen(DEFAULT_PERSONAL_LOOK)).toBe(true);
        expect([...PERSONAL_KEYS].sort()).toEqual(Object.keys(DEFAULT_PERSONAL_LOOK).sort());
        expect(PERSONAL_KEYS).toEqual([...PERSONAL_CHOICES, ...PERSONAL_SWITCHES]);
        expect(ME_STORAGE_KEY).toBe('aero-poker-night:me');
    });

    it('reads each field on its own, dropping what does not read', () => {
        expect(personalPatchOf({cardBack: 'tartan', fourColour: true})).toEqual({cardBack: 'tartan', fourColour: true});
        expect(personalPatchOf({cardBack: 'plaid', chips: 'neon', sound: 'yes', buzz: 0, keepAwake: false, extra: 1})).toEqual({chips: 'neon', keepAwake: false});
        for (const raw of [null, undefined, 7, 'tartan', [], [{cardBack: 'tartan'}], true]) expect(personalPatchOf(raw)).toEqual({});
        // Only own properties: nothing comes from a prototype.
        const proto = Object.create({cardBack: 'tartan', sound: false});
        expect(personalPatchOf(proto)).toEqual({});
        expect(personalPatchOf(JSON.parse('{"__proto__": {"cardBack": "aero"}, "constructor": "x"}'))).toEqual({});
        for (const id of CARD_BACK_IDS) expect(personalPatchOf({cardBack: id})).toEqual({cardBack: id});
        for (const id of CARD_FACE_IDS) expect(personalPatchOf({cardFace: id})).toEqual({cardFace: id});
        for (const id of CHIP_SET_IDS) expect(personalPatchOf({chips: id})).toEqual({chips: id});
    });

    it('resolves a whole look over a fallback', () => {
        expect(resolvePersonalLook(undefined)).toEqual(DEFAULT_PERSONAL_LOOK);
        expect(resolvePersonalLook({muteEmotes: true, cardFace: 'huge'})).toEqual({...DEFAULT_PERSONAL_LOOK, muteEmotes: true});
        const account: PersonalLook = {...DEFAULT_PERSONAL_LOOK, cardBack: 'aero', sound: false};
        expect(resolvePersonalLook({sound: true}, account)).toEqual({...account, sound: true});
    });

    it('names the fields that changed', () => {
        const next: PersonalLook = {...DEFAULT_PERSONAL_LOOK, chips: 'mono', handHints: false};
        expect(personalDiff(DEFAULT_PERSONAL_LOOK, next)).toEqual({chips: 'mono', handHints: false});
        expect(personalDiff(next, next)).toEqual({});
        expect(samePersonalLook(DEFAULT_PERSONAL_LOOK, {...DEFAULT_PERSONAL_LOOK})).toBe(true);
        expect(samePersonalLook(DEFAULT_PERSONAL_LOOK, next)).toBe(false);
    });
});

describe('what a browser keeps', () => {
    it('reads a name, a look and the changed fields, each only when it reads', () => {
        expect(parseStoredMe(JSON.stringify({v: 1, name: ' Sam ', avatar, look: {cardBack: 'aero', shortcuts: false}})))
            .toEqual({name: 'Sam', avatar, look: {cardBack: 'aero', shortcuts: false}});
        expect(parseStoredMe(JSON.stringify({name: '', avatar: 'v1:nope', look: {cardBack: 7}}))).toEqual({name: null, avatar: null, look: {}});
    });

    it('reads nothing from an empty, broken or foreign value', () => {
        for (const raw of [null, '', 'not json', '42', 'null', '[]', '"text"', JSON.stringify({name: 7, avatar: false, look: 'x'})]) {
            expect(parseStoredMe(raw), String(raw)).toEqual(EMPTY_ME);
        }
    });

    it('lays a change over what is kept, field by field, keeping what a later version added', () => {
        const kept = JSON.stringify({v: 1, name: 'Sam', avatar, look: {cardBack: 'aero'}, later: {x: 1}});
        const next = JSON.parse(nextStoredMe(kept, {look: {fourColour: true}}));
        expect(next).toEqual({v: 1, name: 'Sam', avatar, look: {cardBack: 'aero', fourColour: true}, later: {x: 1}});
        expect(parseStoredMe(nextStoredMe(kept, {name: 'Ana', avatar: 'v1:fox:lime:none:none'}))).toEqual({name: 'Ana', avatar: 'v1:fox:lime:none:none', look: {cardBack: 'aero'}});
        // A bad part of the change is dropped; a null clears.
        expect(parseStoredMe(nextStoredMe(kept, {avatar: 'v1:wolf:x:y:z', look: {cardBack: 'plaid' as never, sound: false}}))).toEqual({name: 'Sam', avatar, look: {cardBack: 'aero', sound: false}});
        expect(parseStoredMe(nextStoredMe(kept, {name: null, avatar: null}))).toEqual({name: null, avatar: null, look: {cardBack: 'aero'}});
        // From nothing, or from a broken value.
        expect(JSON.parse(nextStoredMe(null, {look: {sound: false}}))).toEqual({v: 1, look: {sound: false}});
        expect(JSON.parse(nextStoredMe('{oops', {avatar}))).toEqual({v: 1, look: {}, avatar});
        // A kept look that no longer reads keeps only what still reads.
        expect(JSON.parse(nextStoredMe(JSON.stringify({look: {cardBack: 'gone', chips: 'neon'}}), {})).look).toEqual({chips: 'neon'});
    });

    it('plays with the browser\'s own changes over the account\'s look', () => {
        const account: PersonalLook = {...DEFAULT_PERSONAL_LOOK, cardBack: 'tartan', chips: 'pastel'};
        expect(effectiveLook(EMPTY_ME)).toEqual(DEFAULT_PERSONAL_LOOK);
        expect(effectiveLook(EMPTY_ME, account)).toEqual(account);
        expect(effectiveLook({name: null, avatar: null, look: {chips: 'neon'}}, account)).toEqual({...account, chips: 'neon'});
    });

    it('offers the browser\'s look for the account only when a changed field differs from it', () => {
        const account: PersonalLook = {...DEFAULT_PERSONAL_LOOK, cardBack: 'tartan'};
        expect(lookDiffers({}, account)).toBe(false);
        expect(lookDiffers({cardBack: 'tartan'}, account)).toBe(false);
        expect(lookDiffers({cardBack: 'aero'}, account)).toBe(true);
        expect(lookDiffers({muteEmotes: true}, account)).toBe(true);
    });

    it('keeps none of its own look once the lobby saved to the account, so a later save elsewhere reaches its tables', () => {
        // This browser changed its back at a table, then saved it (and its name and look) to the account.
        const kept = nextStoredMe(nextStoredMe(null, {name: 'Ana', avatar}), {look: {cardBack: 'starfield', fourColour: true}});
        const after = afterAccountSave(`${kept.slice(0, -1)},"later":7}`, {name: 'Ana B', avatar: 'v1:fox:lime:none:none'});
        const me = parseStoredMe(after);
        expect(me).toEqual({name: 'Ana B', avatar: 'v1:fox:lime:none:none', look: {}});
        expect(JSON.parse(after).later).toBe(7);
        // Another device then saves tartan: the tables here follow the account.
        const newer: PersonalLook = {...DEFAULT_PERSONAL_LOOK, cardBack: 'tartan'};
        expect(effectiveLook(me, newer)).toEqual(newer);
        expect(lookDiffers(me.look, newer)).toBe(false);
        // A blank name clears the browser's.
        expect(parseStoredMe(afterAccountSave(kept, {name: '', avatar})).name).toBeNull();
        // A null look clears; an empty one changes nothing.
        expect(parseStoredMe(nextStoredMe(kept, {look: null})).look).toEqual({});
        expect(parseStoredMe(nextStoredMe(kept, {look: {}})).look).toEqual({cardBack: 'starfield', fourColour: true});
    });
});

describe('what an account saves', () => {
    it('takes any of the personal fields, each one of ours, and nothing else', () => {
        expect(PersonalLookSchema.safeParse({}).success).toBe(true);
        expect(PersonalLookSchema.safeParse(DEFAULT_PERSONAL_LOOK).success).toBe(true);
        expect(PersonalLookSchema.safeParse({cardBack: 'tartan', chips: 'mono', muteEmotes: true}).success).toBe(true);
        for (const bad of [{cardBack: 'plaid'}, {chips: 'gold'}, {cardFace: 'huge'}, {sound: 'on'}, {extra: true}, null, 'tartan']) {
            expect(PersonalLookSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
        }
    });

    it('takes a scene and a felt for the host\'s new tables, both of ours', () => {
        expect(TableLookSchema.safeParse({scene: 'deep-space', felt: 'violet'}).success).toBe(true);
        for (const bad of [{scene: 'deep-space'}, {scene: 'moon', felt: 'violet'}, {scene: 'deep-space', felt: 'plaid'}, {scene: 'deep-space', felt: 'violet', x: 1}]) {
            expect(TableLookSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
        }
    });
});
