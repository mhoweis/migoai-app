import 'dotenv/config';
import { reminderKindFor } from '../src/services/reminders.service';

describe('reminderKindFor', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');
  const after = (milliseconds: number) => new Date(now.getTime() + milliseconds);

  test('uses the 2-hour booked window through its exact boundary', () => {
    expect(reminderKindFor('booked', after(2 * 60 * 60 * 1000), now)).toBe('booked_2h');
  });

  test('uses the 24-hour booked window through its exact boundary', () => {
    expect(reminderKindFor('booked', after(24 * 60 * 60 * 1000), now)).toBe('booked_24h');
  });

  test('uses the 48-hour saved window through its exact boundary', () => {
    expect(reminderKindFor('saved', after(48 * 60 * 60 * 1000), now)).toBe('saved_48h');
  });

  test('returns null for past, current, and out-of-window dates', () => {
    expect(reminderKindFor('booked', after(-1), now)).toBeNull();
    expect(reminderKindFor('saved', now, now)).toBeNull();
    expect(reminderKindFor('booked', after(24 * 60 * 60 * 1000 + 1), now)).toBeNull();
    expect(reminderKindFor('saved', after(48 * 60 * 60 * 1000 + 1), now)).toBeNull();
  });
});
