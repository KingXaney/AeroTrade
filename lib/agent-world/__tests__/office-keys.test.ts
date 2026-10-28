import {describe, expect, it} from 'vitest';
import {officeIntentForKey, OFFICE_KEY_SHORTCUTS, ZOOM_IN, ZOOM_OUT} from '@/lib/agent-world/office-keys';
import {OFFICE_PRESET_IDS} from '@/lib/agent-world/office-layout';

describe('the office\'s keys', () => {
    it('maps the digits to the camera presets in order', () => {
        OFFICE_PRESET_IDS.forEach((preset, i) => {
            expect(officeIntentForKey({key: String(i)})).toEqual({type: 'preset', preset});
            expect(OFFICE_KEY_SHORTCUTS.preset(preset)).toBe(String(i));
        });
        expect(officeIntentForKey({key: '8'})).toBeNull();
    });

    it('maps the letters and marks, either case', () => {
        expect(officeIntentForKey({key: 'f'})).toEqual({type: 'follow'});
        expect(officeIntentForKey({key: 'F'})).toEqual({type: 'follow'});
        expect(officeIntentForKey({key: '+'})).toEqual({type: 'zoom', factor: ZOOM_IN});
        expect(officeIntentForKey({key: '='})).toEqual({type: 'zoom', factor: ZOOM_IN});
        expect(officeIntentForKey({key: '-'})).toEqual({type: 'zoom', factor: ZOOM_OUT});
        expect(officeIntentForKey({key: ']'})).toEqual({type: 'step', by: 1});
        expect(officeIntentForKey({key: '['})).toEqual({type: 'step', by: -1});
        expect(officeIntentForKey({key: 'r'})).toEqual({type: 'replay'});
        expect(officeIntentForKey({key: 'p'})).toEqual({type: 'plan'});
        expect(officeIntentForKey({key: 'm'})).toEqual({type: 'sound'});
        expect(officeIntentForKey({key: 'Escape'})).toEqual({type: 'clear'});
        expect(officeIntentForKey({key: 'x'})).toBeNull();
    });

    it('stays out of the way of modified keys and repeats', () => {
        for (const mod of [{metaKey: true}, {ctrlKey: true}, {altKey: true}, {repeat: true}]) {
            expect(officeIntentForKey({key: 'f', ...mod})).toBeNull();
            expect(officeIntentForKey({key: '1', ...mod})).toBeNull();
        }
    });
});
