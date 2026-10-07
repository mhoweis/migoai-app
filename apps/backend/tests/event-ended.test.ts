import 'dotenv/config';
import { eventHasEnded } from '../src/services/events.service';

describe('eventHasEnded', () => {
  const now = new Date(2026, 9, 7, 12, 0, 0);

  test('returns true when the end date is in the past', () => {
    expect(eventHasEnded({
      startDate: new Date(2026, 9, 6, 8, 30),
      endDate: new Date(2026, 9, 7, 11, 59),
    }, now)).toBe(true);
  });

  test('returns false while an event that started in the past is still ongoing', () => {
    expect(eventHasEnded({
      startDate: new Date(2026, 9, 6, 8, 30),
      endDate: new Date(2026, 9, 8, 18, 0),
    }, now)).toBe(false);
  });

  test('returns false when an event without an end date started earlier today', () => {
    expect(eventHasEnded({ startDate: new Date(2026, 9, 7, 8, 30) }, now)).toBe(false);
  });

  test('returns true when an event without an end date started yesterday', () => {
    expect(eventHasEnded({ startDate: new Date(2026, 9, 6, 8, 30) }, now)).toBe(true);
  });
});
