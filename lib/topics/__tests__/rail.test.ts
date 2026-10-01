import {describe, expect, it} from 'vitest';
import {sortTopicsForRail} from '@/lib/topics/rail';

type Row = {name: string; unseenCount: number; latest: {datetime: number} | null};
const row = (name: string, unseenCount: number, datetime: number | null): Row =>
    ({name, unseenCount, latest: datetime === null ? null : {datetime}});
const names = (rows: readonly Row[]) => rows.map((r) => r.name);

describe('sortTopicsForRail', () => {
    const sort = sortTopicsForRail<Row>;

    it('puts the most unseen articles first', () => {
        expect(names(sort([row('a', 0, 300), row('b', 5, 100), row('c', 2, 200)]))).toEqual(['b', 'c', 'a']);
    });

    it('breaks unseen ties by the latest article, newest first', () => {
        expect(names(sort([row('a', 1, 100), row('b', 1, 300), row('c', 1, 200)]))).toEqual(['b', 'c', 'a']);
    });

    it('puts a topic with no article yet after its ties', () => {
        expect(names(sort([row('empty', 0, null), row('old', 0, 50)]))).toEqual(['old', 'empty']);
    });

    it('keeps the input order for full ties and leaves the input untouched', () => {
        const input = [row('a', 0, null), row('b', 0, null), row('c', 3, 10)];
        expect(names(sort(input))).toEqual(['c', 'a', 'b']);
        expect(names(input)).toEqual(['a', 'b', 'c']);
    });
});
