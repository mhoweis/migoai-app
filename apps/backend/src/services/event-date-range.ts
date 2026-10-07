import { Prisma } from '@prisma/client';

type DateValue = Date | string | undefined;

const normalizeBoundary = (value: DateValue, endOfDay: boolean): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : undefined;

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const normalized = dateOnly
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+04:00`
    : value;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : undefined;
};

export function eventDateOverlapWhere(from?: DateValue, to?: DateValue): Prisma.EventWhereInput[] {
  const dateFrom = normalizeBoundary(from, false);
  const dateTo = normalizeBoundary(to, true);
  const conditions: Prisma.EventWhereInput[] = [];

  if (dateTo) conditions.push({ startDate: { lte: dateTo } });
  if (dateFrom) {
    conditions.push({
      OR: [
        { endDate: { gte: dateFrom } },
        { endDate: null, startDate: { gte: dateFrom } },
      ],
    });
  }

  return conditions;
}
