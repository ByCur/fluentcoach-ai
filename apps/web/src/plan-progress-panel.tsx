import { useEffect, useState } from 'react';
import type { IssueTrend } from '@fluentcoach/application';
import type { progressMetrics } from '@fluentcoach/domain';
type Metrics = ReturnType<typeof progressMetrics>;
export function PlanProgressPanel() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [issues, setIssues] = useState<IssueTrend[]>([]);
  const [message, setMessage] = useState('');
  async function load() {
    const [progress, trends] = await Promise.all([
      fetch('/api/v1/progress', { credentials: 'include' }),
      fetch('/api/v1/progress/issues', { credentials: 'include' }),
    ]);
    if (!progress.ok || !trends.ok) throw Error('LOAD_FAILED');
    setMetrics(await progress.json() as Metrics);
    setIssues(await trends.json() as IssueTrend[]);
    setMessage('');
  }
  useEffect(() => { void load().catch(() => setMessage('No pudimos cargar tu progreso. Vuelve a intentarlo.')); }, []);
  return <>
      <section aria-labelledby="learner-progress">
        <h2 id="learner-progress">Mi progreso</h2>
        <button
          className="secondary"
          onClick={() =>
            void load().catch(() =>
              setMessage('No pudimos actualizar. Reintenta.'),
            )
          }
        >
          Actualizar progreso
        </button>
        {metrics && (
          <dl>
            <dt>Minutos de práctica esta semana</dt>
            <dd data-testid="active-minutes">
              {metrics.activeMinutes.toFixed(1)}
            </dd>
            <dt>Minutos de conversación por voz</dt>
            <dd data-testid="speaking-minutes">
              {metrics.speakingMinutes.toFixed(1)}
            </dd>
            <dt>Minutos de práctica escrita</dt>
            <dd data-testid="text-minutes">{metrics.textMinutes.toFixed(1)}</dd>
            <dt>Prácticas terminadas</dt>
            <dd data-testid="completed-sessions">
              {metrics.completedSessions} ({metrics.completedSessionsThisWeek}{' '}
              esta semana)
            </dd>
            <dt>Objetivo semanal</dt>
            <dd>
              {metrics.targetMinutes} minutos ·{' '}
              {metrics.activeMinutes.toFixed(1)} practicados
            </dd>
            <dt>Días practicados / objetivo</dt>
            <dd>
              {metrics.practicedDays} / {metrics.targetDays}
            </dd>
            <dt>Racha de conversación</dt>
            <dd>
              {metrics.speakingStreak.current} días · al menos 2 minutos de voz
              por día
            </dd>
            <dt>Repasos de vocabulario</dt>
            <dd>
              {metrics.reviewsThisWeek} esta semana · {metrics.reviewsToday} hoy
              · {metrics.dueCards} expresiones pendientes
            </dd>
          </dl>
        )}
        <p>
          Cuenta el tiempo de hablar y escribir durante la práctica. La espera no
          cuenta. La semana empieza el lunes y cada práctica conserva la fecha
          del lugar donde la hiciste.
        </p>
        <h3>Aspectos que aparecen en tus prácticas</h3>
        {!issues.length && (
          <p>Datos insuficientes para mostrar una tendencia.</p>
        )}
        {issues.map((i) => (
          <article key={i.issueKey}>
            <h4>{i.label}</h4>
            <p>
              {i.observationCount} observaciones en {i.sessionCount} sesiones.
            </p>
            {i.buckets.map((b) => (
              <p key={b.startsAt}>
                {b.startsAt.slice(0, 10)} — {b.endsAt.slice(0, 10)} (UTC):{' '}
                {b.observations} observaciones en {b.sessions} sesiones.
              </p>
            ))}
            <p>{i.message}</p>
          </article>
        ))}
      </section>
    <p role="status" aria-live="polite">{message}</p>
  </>;
}
