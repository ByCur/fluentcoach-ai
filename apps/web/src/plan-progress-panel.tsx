import { useEffect, useState } from 'react';
import type {
  LearningPlan,
  IssueTrend,
  PlanActivity,
} from '@fluentcoach/application';
import type { progressMetrics } from '@fluentcoach/domain';
type Metrics = ReturnType<typeof progressMetrics>;
export function PlanProgressPanel({
  csrf,
  onStart,
  onEvidence,
}: {
  csrf: string;
  onStart: (sessionId: string, activity: PlanActivity) => void;
  onEvidence: (sessionId: string) => void;
}) {
  const [plans, setPlans] = useState<{
    active: LearningPlan | null;
    proposal: LearningPlan | null;
  }>({ active: null, proposal: null });
  const [metrics, setMetrics] = useState<Metrics | null>(null),
    [issues, setIssues] = useState<IssueTrend[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState('');
  async function call(path: string, body?: unknown) {
    const response = await fetch(`/api/v1${path}`, {
      credentials: 'include',
      ...(body
        ? {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-csrf-token': csrf,
            },
            body: JSON.stringify(body),
          }
        : {}),
    });
    if (response.status === 409) setRequestKey('');
    if (!response.ok)
      throw Error(
        response.status === 409
          ? 'El plan o sus fuentes han cambiado. Actualiza la vista.'
          : 'No pudimos cargar o generar el plan. Puedes reintentarlo; tu progreso se conserva.',
      );
    return response;
  }
  async function load() {
    const [p, m, i] = await Promise.all([
      call('/plans/current'),
      call('/progress'),
      call('/progress/issues'),
    ]);
    setPlans((await p.json()) as typeof plans);
    setMetrics((await m.json()) as Metrics);
    setIssues((await i.json()) as IssueTrend[]);
  }
  useEffect(() => {
    void load().catch(() =>
      setMessage(
        'Aún no hay datos o no pudimos cargar el progreso. Completa tu perfil y reintenta.',
      ),
    );
  }, []);
  async function action(path: string, body: unknown, activity?: PlanActivity) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await call(path, body);
      if (activity) {
        const result = (await response.json()) as { sessionId: string | null };
        if (result.sessionId) onStart(result.sessionId, activity);
        else
          setMessage(
            'Repaso iniciado. Usa la sección Vocabulario para repasar las expresiones pendientes.',
          );
      } else setMessage('Plan guardado.');
      setRequestKey('');
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Puedes reintentarlo.');
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  function generate(plan?: LearningPlan) {
    const key = requestKey || crypto.randomUUID();
    setRequestKey(key);
    void action(plan ? `/plans/${plan.id}/refresh` : '/plans/generate', {
      requestKey: key,
      ...(plan ? { expectedVersion: plan.version } : {}),
    });
  }
  function renderPlan(plan: LearningPlan) {
    return (
      <article
        key={plan.id}
        aria-label={
          plan.state === 'proposal' ? 'Propuesta de plan' : 'Plan activo'
        }
      >
        <h3>{plan.state === 'proposal' ? 'Propuesta' : 'Plan activo'}</h3>
        <p>{plan.rationale}</p>
        <ul>
          {plan.activities.map((a) => (
            <li key={a.id}>
              <h4>{a.title}</h4>
              <p>
                {a.targetMinutes} minutos · {a.rationale}
              </p>
              <p>
                Estado:{' '}
                {a.state === 'completed'
                  ? 'Completada'
                  : a.state === 'skipped'
                    ? 'Omitida'
                    : a.state === 'unavailable'
                      ? 'Fuente no disponible'
                      : a.state === 'started'
                        ? 'Iniciada'
                        : 'Pendiente'}
              </p>
              {a.evidence?.map((e, index) => (
                <p key={index}>
                  Ejemplo: «{e.evidence.quote}»{' '}
                  <button
                    className="secondary"
                    onClick={() => onEvidence(e.sessionId)}
                  >
                    Ver evidencia de sesión
                  </button>
                </p>
              ))}
              {['pending', 'unavailable'].includes(a.state) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(`/plans/${plan.id}/activities/${a.id}/skip`, {
                      expectedVersion: plan.version,
                    })
                  }
                >
                  Omitir {a.title}
                </button>
              )}
              {plan.state === 'active' && a.state === 'pending' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(
                      `/plans/${plan.id}/activities/${a.id}/start`,
                      { expectedVersion: plan.version },
                      a,
                    )
                  }
                >
                  Practicar {a.title}
                </button>
              )}
              {a.sessionId && a.state === 'started' && (
                <button onClick={() => onStart(a.sessionId!, a)}>
                  Continuar {a.title}
                </button>
              )}
            </li>
          ))}
        </ul>
        {plan.state === 'proposal' && (
          <button
            disabled={busy}
            onClick={() =>
              void action(`/plans/${plan.id}/accept`, {
                expectedVersion: plan.version,
              })
            }
          >
            Aceptar plan
          </button>
        )}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => generate(plan)}
        >
          Actualizar plan
        </button>
      </article>
    );
  }
  return (
    <>
      <section aria-labelledby="practice-plan">
        <h2 id="practice-plan">Tu plan de práctica</h2>
        {!plans.active && !plans.proposal && (
          <p>
            Genera una propuesta basada en tu nivel seleccionado y tu objetivo.
          </p>
        )}
        {plans.active && renderPlan(plans.active)}
        {plans.proposal && renderPlan(plans.proposal)}
        {!plans.proposal && (
          <button
            disabled={busy}
            onClick={() => generate(plans.active ?? undefined)}
          >
            Generar/Ver propuesta
          </button>
        )}
        <p role="status" aria-live="polite">
          {message}
        </p>
      </section>
      <section aria-labelledby="learner-progress">
        <h2 id="learner-progress">Tu progreso</h2>
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
            <dt>Minutos activos esta semana</dt>
            <dd data-testid="active-minutes">
              {metrics.activeMinutes.toFixed(1)}
            </dd>
            <dt>Minutos de conversación por voz</dt>
            <dd data-testid="speaking-minutes">
              {metrics.speakingMinutes.toFixed(1)}
            </dd>
            <dt>Minutos de práctica escrita</dt>
            <dd data-testid="text-minutes">{metrics.textMinutes.toFixed(1)}</dd>
            <dt>Sesiones completadas</dt>
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
              · {metrics.dueCards} tarjetas pendientes
            </dd>
          </dl>
        )}
        <p>
          Solo actividad aceptada. La espera y el tiempo inactivo no cuentan. La
          semana empieza el lunes; cada actividad conserva su fecha local
          original.
        </p>
        <h3>Observaciones por prioridad</h3>
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
    </>
  );
}
