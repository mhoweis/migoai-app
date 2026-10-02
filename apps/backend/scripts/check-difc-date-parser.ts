import assert from 'node:assert/strict';
import 'dotenv/config';
import { parseDifcDateRange } from '../src/services/providers/difc.provider';

const cases = [
  {
    value: '7 October 2026',
    start: '2026-10-06T20:00:00.000Z',
    end: '2026-10-07T19:59:00.000Z',
  },
  {
    value: 'Date: 26 - 27 October 2026',
    start: '2026-10-25T20:00:00.000Z',
    end: '2026-10-27T19:59:00.000Z',
  },
  {
    value: '8 to 10 December 2026',
    start: '2026-12-07T20:00:00.000Z',
    end: '2026-12-10T19:59:00.000Z',
  },
  {
    value: '31 October - 1 November 2026',
    start: '2026-10-30T20:00:00.000Z',
    end: '2026-11-01T19:59:00.000Z',
  },
  {
    value: '28 December 2026 - 2 January 2027',
    start: '2026-12-27T20:00:00.000Z',
    end: '2027-01-02T19:59:00.000Z',
  },
  {
    value: 'till 31 March 2026',
    entityDate: Date.parse('2026-03-18T08:00:00.000Z'),
    start: '2026-03-17T20:00:00.000Z',
    end: '2026-03-31T19:59:00.000Z',
  },
];

for (const testCase of cases) {
  const range = parseDifcDateRange(testCase.value, testCase.entityDate);
  assert.ok(range, `expected a date range for ${testCase.value}`);
  assert.equal(range.startDate.toISOString(), testCase.start, `start: ${testCase.value}`);
  assert.equal(range.endDate.toISOString(), testCase.end, `end: ${testCase.value}`);
}

assert.equal(parseDifcDateRange(''), undefined);
assert.equal(parseDifcDateRange('till March 2026'), undefined);
console.log('DIFC date parser: 6 formats passed; empty and unparseable values skipped.');
