// Every model is sorted: a reader's own data, or not and why. A new model file fails here until
// someone decides, so deleting an account cannot quietly leave a new collection behind.

import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {NOT_USER_DATA, USER_DATA} from '@/lib/account/user-data';

const MODELS_DIR = path.resolve(__dirname, '../../../database/models');
const files = readdirSync(MODELS_DIR).filter((file) => file.endsWith('.model.ts')).map((file) => file.replace(/\.model\.ts$/, '')).sort();
const source = (name: string) => readFileSync(path.join(MODELS_DIR, `${name}.model.ts`), 'utf8');

describe('the user-data registry', () => {
    it('sorts every model file exactly once', () => {
        const sorted = [...Object.keys(USER_DATA), ...Object.keys(NOT_USER_DATA)].sort();
        expect(sorted).toEqual(files);
        expect(new Set(sorted).size).toBe(sorted.length);
    });

    it('names fields each model\'s schema really has', () => {
        for (const [name, fields] of Object.entries(USER_DATA)) {
            for (const field of fields) expect(source(name), `${name}.${field}`).toMatch(new RegExp(`\\b${field}: \\{type: String`));
        }
    });

    it('lists no model with a userId field as not a reader\'s without saying why it is not', () => {
        for (const [name, why] of Object.entries(NOT_USER_DATA)) {
            expect(why.length, name).toBeGreaterThan(8);
            // A schema field, not a mention in a comment.
            if (/^\s+userId: \{type: String/m.test(source(name))) expect(['poker-room'], name).toContain(name);
        }
    });

    it('deletes what trades before the books, and the preferences last', () => {
        const order = Object.keys(USER_DATA);
        for (const trader of ['ai-navigator', 'culture-follow', 'broker-link']) expect(order.indexOf(trader)).toBeLessThan(order.indexOf('paper-account'));
        expect(order.indexOf('paper-trade')).toBeLessThan(order.indexOf('paper-account'));
        expect(order.at(-1)).toBe('user-preferences');
    });
});
