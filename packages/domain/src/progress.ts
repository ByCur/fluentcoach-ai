/** Calendar arithmetic always uses UTC internally; event dates are immutable snapshots. */
export function localDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((day + 6) % 7));
}
export type ProgressEvent = {
  kind: 'voice' | 'text' | 'session-completed';
  durationMs: number;
  localDate: string;
};
export function speakingStreak(
  events: readonly ProgressEvent[],
  today: string,
) {
  const days = new Map<string, number>();
  for (const e of events)
    if (e.kind === 'voice')
      days.set(e.localDate, (days.get(e.localDate) ?? 0) + e.durationMs);
  const qualified = new Set(
    [...days]
      .filter(([date, ms]) => ms >= 120000 && date <= today)
      .map(([date]) => date),
  );
  let cursor = qualified.has(today) ? today : shiftDate(today, -1),
    current = 0;
  while (qualified.has(cursor)) {
    current++;
    cursor = shiftDate(cursor, -1);
  }
  let longest = 0,
    run = 0,
    previous = '';
  for (const date of [...qualified].sort()) {
    run = shiftDate(previous || date, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest };
}
export function progressMetrics(
  events: readonly ProgressEvent[],
  reviews: readonly { localDate: string }[],
  now: Date,
  timezone: string,
  goal: { minutesPerDay: number; daysPerWeek: number },
  dueCards: number,
) {
  const today = localDateAt(now, timezone),
    monday = mondayOf(today);
  // Current timezone determines calendar boundaries; saved event dates are never reinterpreted.
  const weekly = events.filter(
    (e) => e.localDate >= monday && e.localDate <= today,
  );
  const voiceMs = weekly
    .filter((e) => e.kind === 'voice')
    .reduce((n, e) => n + e.durationMs, 0);
  const textMs = weekly
    .filter((e) => e.kind === 'text')
    .reduce((n, e) => n + e.durationMs, 0);
  return {
    today,
    weekStartsOn: monday,
    timezone,
    activeMinutes: (voiceMs + textMs) / 60000,
    speakingMinutes: voiceMs / 60000,
    textMinutes: textMs / 60000,
    completedSessions: events.filter((e) => e.kind === 'session-completed')
      .length,
    completedSessionsThisWeek: weekly.filter(
      (e) => e.kind === 'session-completed',
    ).length,
    targetDays: goal.daysPerWeek,
    practicedDays: new Set(
      weekly.filter((e) => e.durationMs > 0).map((e) => e.localDate),
    ).size,
    targetMinutes: goal.minutesPerDay * goal.daysPerWeek,
    speakingStreak: speakingStreak(events, today),
    reviewsThisWeek: reviews.filter(
      (e) => e.localDate >= monday && e.localDate <= today,
    ).length,
    reviewsToday: reviews.filter((e) => e.localDate === today).length,
    dueCards,
  };
}
export const TEXT_MAX_ACTIVE_DURATION_MS = 300000;
export type PracticeTelemetry = { kind: 'text' | 'voice'; durationMs: number };
export function boundedPracticeTelemetry(
  value: PracticeTelemetry,
): PracticeTelemetry {
  if (
    !Number.isSafeInteger(value.durationMs) ||
    value.durationMs < 0 ||
    !['text', 'voice'].includes(value.kind)
  )
    throw Error('INVALID_ACTIVE_DURATION');
  if (
    value.kind === 'voice' &&
    (value.durationMs < 1 || value.durationMs > 30000)
  )
    throw Error('INVALID_ACTIVE_DURATION');
  return {
    kind: value.kind,
    durationMs: Math.min(value.durationMs, TEXT_MAX_ACTIVE_DURATION_MS),
  };
}
