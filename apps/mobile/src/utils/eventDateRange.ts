type EventDates = {
  startDate: string | Date;
  endDate?: string | Date | null;
};

const parseDateBoundary = (value: string, endOfDay: boolean): number | null => {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const normalized = dateOnly
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+04:00`
    : value;
  const timestamp = new Date(normalized).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const toTimestamp = (value: string | Date): number => (
  value instanceof Date ? value.getTime() : new Date(value).getTime()
);

export function matchesEventDateRange(
  event: EventDates,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;

  const start = toTimestamp(event.startDate);
  const end = event.endDate ? toTimestamp(event.endDate) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;

  const fromTime = from ? parseDateBoundary(from, false) : null;
  const toTime = to ? parseDateBoundary(to, true) : null;

  return (fromTime === null || end >= fromTime) &&
    (toTime === null || start <= toTime);
}
