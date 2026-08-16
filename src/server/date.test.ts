import test from 'node:test';
import assert from 'node:assert';
import { getDailyQueueKey, getTodayBounds } from './date.ts';

test('DATE TESTS', () => {
  const d1 = new Date('2026-08-09T10:00:00Z');
  const d2 = new Date('2026-08-10T00:00:00Z'); // 05:30 IST Aug 10
  const d3 = new Date('2026-01-01T23:59:59Z'); // 05:29 IST Jan 2
  
  assert.strictEqual(getDailyQueueKey('SubA', d1), 'subreddit:suba:queue:deals:2026-08-09');
  assert.strictEqual(getDailyQueueKey('SubA', d2), 'subreddit:suba:queue:deals:2026-08-10');
  assert.strictEqual(getDailyQueueKey('SubB', d3), 'subreddit:subb:queue:deals:2026-01-02');
  
  assert.notStrictEqual(getDailyQueueKey('SubA', d1), getDailyQueueKey('SubA', d2));
  assert.notStrictEqual(getDailyQueueKey('SubA', d1), getDailyQueueKey('SubB', d1));
});

test('India midnight boundary correctly shifts dates', () => {
  const preMidnightUTC = new Date('2026-08-09T18:29:00Z'); // 23:59 IST Aug 9
  const postMidnightUTC = new Date('2026-08-09T18:30:00Z'); // 00:00 IST Aug 10
  
  assert.strictEqual(getDailyQueueKey('SubA', preMidnightUTC), 'subreddit:suba:queue:deals:2026-08-09');
  assert.strictEqual(getDailyQueueKey('SubA', postMidnightUTC), 'subreddit:suba:queue:deals:2026-08-10');
});

test('getTodayBounds generates correct start and end boundaries for IST', () => {
  const { start, end } = getTodayBounds();
  
  // start should be at 18:30:00.000 UTC of the previous or current UTC day, which corresponds to 00:00 IST
  assert.strictEqual(start.getUTCHours(), 18);
  assert.strictEqual(start.getUTCMinutes(), 30);
  assert.strictEqual(start.getUTCSeconds(), 0);
  assert.strictEqual(start.getUTCMilliseconds(), 0);
  
  // end should be exactly 24 hours after start
  assert.strictEqual(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});
