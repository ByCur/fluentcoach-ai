import { describe, expect, it } from 'vitest';
import {
  localDateAt,
  mondayOf,
  progressMetrics,
  speakingStreak,
  boundedPracticeTelemetry,
  type ProgressEvent,
} from './progress.js';
describe('M09 immutable local dates and calendar rules', () => {
  it.each([
    ['2026-10-04T21:59:59.999Z', 'Europe/Madrid', '2026-10-04'],
    ['2026-10-04T22:00:00.000Z', 'Europe/Madrid', '2026-10-05'],
    ['2026-10-04T22:00:00.001Z', 'Europe/Madrid', '2026-10-05'],
    ['2026-03-29T00:59:59.999Z', 'Europe/Madrid', '2026-03-29'],
    ['2026-03-29T01:00:00.000Z', 'Europe/Madrid', '2026-03-29'],
    ['2026-10-25T00:59:59.999Z', 'Europe/Madrid', '2026-10-25'],
    ['2026-10-25T01:00:00.000Z', 'Europe/Madrid', '2026-10-25'],
    ['2026-10-05T03:59:59.999Z', 'America/New_York', '2026-10-04'],
    ['2026-10-05T04:00:00.000Z', 'America/New_York', '2026-10-05'],
    ['2026-10-04T15:00:00.000Z', 'Asia/Tokyo', '2026-10-05'],
  ])('snapshots %s in %s as %s', (instant, zone, date) =>
    expect(localDateAt(new Date(instant), zone)).toBe(date),
  );
  it('rejects invalid IANA timezone', () =>
    expect(() =>
      localDateAt(new Date('2026-10-05T00:00:00Z'), 'invalid'),
    ).toThrow());
  it('starts weekly goals Monday across Sunday boundary', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
  });
  const voice = (localDate: string, durationMs = 120000): ProgressEvent => ({
    localDate,
    durationMs,
    kind: 'voice',
  });
  it('119 seconds does not qualify; 120 summed seconds qualifies', () => {
    expect(
      speakingStreak([voice('2026-10-05', 119000)], '2026-10-05').current,
    ).toBe(0);
    expect(
      speakingStreak(
        [voice('2026-10-05', 60000), voice('2026-10-05', 60000)],
        '2026-10-05',
      ).current,
    ).toBe(1);
  });
  it('continues normal boundaries and breaks at missing qualifying day', () => {
    expect(
      speakingStreak(
        [voice('2026-10-03'), voice('2026-10-04'), voice('2026-10-05')],
        '2026-10-05',
      ),
    ).toEqual({ current: 3, longest: 3 });
    expect(
      speakingStreak(
        [voice('2026-10-02'), voice('2026-10-04'), voice('2026-10-05')],
        '2026-10-05',
      ),
    ).toEqual({ current: 2, longest: 2 });
    expect(speakingStreak([voice('2026-10-02')], '2026-10-05').current).toBe(0);
    expect(speakingStreak([voice('2026-10-04')], '2026-10-05').current).toBe(1);
  });
  it('text, completions and review never count as voice', () => {
    expect(
      speakingStreak(
        [{ kind: 'text', durationMs: 300000, localDate: '2026-10-05' }],
        '2026-10-05',
      ).current,
    ).toBe(0);
  });
  it('retains historical dates after changing timezone and excludes prior week', () => {
    const events = [
      voice('2026-10-04'),
      voice('2026-10-05'),
      { kind: 'text' as const, durationMs: 60000, localDate: '2026-10-05' },
    ];
    const metrics = progressMetrics(
      events,
      [{ localDate: '2026-10-05' }],
      new Date('2026-10-05T12:00:00Z'),
      'America/New_York',
      { minutesPerDay: 10, daysPerWeek: 3 },
      4,
    );
    expect(metrics).toMatchObject({
      weekStartsOn: '2026-10-05',
      speakingMinutes: 2,
      textMinutes: 1,
      activeMinutes: 3,
      targetMinutes: 30,
      practicedDays: 1,
      reviewsThisWeek: 1,
      speakingStreak: { current: 2 },
    });
    expect(events[0]!.localDate).toBe('2026-10-04');
  });
  it('bounds text telemetry; legacy is zero and invalid durations reject', () => {
    expect(
      boundedPracticeTelemetry({ kind: 'text', durationMs: 999999 }).durationMs,
    ).toBe(300000);
    expect(
      boundedPracticeTelemetry({ kind: 'text', durationMs: 0 }).durationMs,
    ).toBe(0);
    for (const ms of [-1, 1.5, NaN, Infinity])
      expect(() =>
        boundedPracticeTelemetry({ kind: 'text', durationMs: ms }),
      ).toThrow();
    expect(() =>
      boundedPracticeTelemetry({ kind: 'voice', durationMs: 30001 }),
    ).toThrow();
  });
});
