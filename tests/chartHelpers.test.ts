import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { padWeeklyData } from '../lib/chartHelpers.ts';

describe('padWeeklyData', () => {
  it('1 uploaded week → 4 labels, data preserved at correct position', () => {
    const data = [{ week: 'Week 2', percentage: 80 }];
    const result = padWeeklyData(data, 'week', 'percentage');
    assert.equal(result.length, 4);
    assert.deepStrictEqual(result.map(r => r.week), ['Week 1', 'Week 2', 'Week 3', 'Week 4']);
    assert.equal(result[0].percentage, null);
    assert.equal(result[1].percentage, 80);
    assert.equal(result[2].percentage, null);
    assert.equal(result[3].percentage, null);
  });

  it('3 uploaded weeks → 4 labels', () => {
    const data = [
      { week: 'Week 1', percentage: 90 },
      { week: 'Week 3', percentage: 70 },
      { week: 'Week 4', percentage: 60 },
    ];
    const result = padWeeklyData(data, 'week', 'percentage');
    assert.equal(result.length, 4);
    assert.equal(result[0].percentage, 90);
    assert.equal(result[1].percentage, null);
    assert.equal(result[2].percentage, 70);
    assert.equal(result[3].percentage, 60);
  });

  it('5 uploaded weeks → 5 labels (exceeds default 4)', () => {
    const data = [
      { week: 'Week 1', percentage: 90 },
      { week: 'Week 2', percentage: 85 },
      { week: 'Week 3', percentage: 80 },
      { week: 'Week 4', percentage: 75 },
      { week: 'Week 5', percentage: 70 },
    ];
    const result = padWeeklyData(data, 'week', 'percentage', 5);
    assert.equal(result.length, 5);
    assert.deepStrictEqual(result.map(r => r.week), ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5']);
    // All slots filled
    assert.deepStrictEqual(result.map(r => r.percentage), [90, 85, 80, 75, 70]);
  });

  it('only Week 2 uploaded: shows data point at "Week 2", not "Week 1"', () => {
    const data = [{ week: 'Week 2', percentage: 55 }];
    const result = padWeeklyData(data, 'week', 'percentage');
    // The data must appear at "Week 2", not shifted to index 0
    const week1 = result.find(r => r.week === 'Week 1');
    const week2 = result.find(r => r.week === 'Week 2');
    assert.equal(week1?.percentage, null);
    assert.equal(week2?.percentage, 55);
  });

  it('empty data → 4 null labels', () => {
    const result = padWeeklyData([], 'week', 'percentage');
    assert.equal(result.length, 4);
    assert.ok(result.every(r => r.percentage === null));
  });
});
