export function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addLocalDays(value: string, days: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

export function formatLocalDate(value: string, locale: string, includeYear = true) {
  if (!value) return '';
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  };
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-GB', options).format(parseLocalDate(value));
}

export function formatLocalTime(value: string, locale: string) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date(1970, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
