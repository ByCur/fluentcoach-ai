import { useEffect, useRef, useState } from 'react';
import type { LearningPlan, PlanActivity } from '@fluentcoach/application';
import type { progressMetrics } from '@fluentcoach/domain';

type Metrics = ReturnType<typeof progressMetrics>;
export function LearnerHome({ csrf, onStart, onVocabulary, onPractice }: {
  csrf: string;
  onStart: (sessionId: string, activity: PlanActivity) => void;
  onVocabulary: (activity: PlanActivity) => void;
  onPractice: () => void;
}) {
  const [route, setRoute] = useState<LearningPlan | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const starting = useRef(false);
  const mounted = useRef(false);
  const startController = useRef<AbortController | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; startController.current?.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/v1/roadmap', { method: 'POST', credentials: 'include',
      headers: { 'x-csrf-token': csrf }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    }).then(async response => {
      if (!response.ok) throw Error('LOAD_FAILED');
      const value = await response.json() as LearningPlan;
      if (!controller.signal.aborted) setRoute(value);
    }).catch(() => {
      if (!controller.signal.aborted) setError('No pudimos cargar tu ruta. Tu progreso se conserva. Vuelve a intentarlo.');
    });
    void fetch('/api/v1/progress', { credentials: 'include', signal: controller.signal })
      .then(async response => { if (response.ok) { const value = await response.json() as Metrics; if (!controller.signal.aborted) setMetrics(value); } })
      .catch(() => undefined);
    return () => controller.abort();
  }, [csrf, reload]);
  const current = route?.activities.find(a => a.state === 'started') ?? route?.activities.find(a => a.state === 'pending');
  const completed = route?.activities.filter(a => a.state === 'completed').length ?? 0;
  async function start() {
    if (!route || !current || starting.current) return;
    starting.current = true;
    const controller = new AbortController();
    startController.current = controller;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/v1/plans/${route.id}/activities/${current.id}/start`, {
        method: 'POST', credentials: 'include', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ expectedVersion: route.version }),
      });
      if (!mounted.current) return;
      if (!response.ok) {
        if (response.status === 409 || response.status === 404) setReload(value => value + 1);
        throw Error('No pudimos abrir esta práctica. Vuelve a intentarlo; tu progreso se conserva.');
      }
      const result = await response.json() as { plan: LearningPlan; sessionId: string | null };
      if (!mounted.current) return;
      setRoute(result.plan);
      if (current.type === 'vocabulary-review') onVocabulary(current);
      else if (result.sessionId) onStart(result.sessionId, current);
      else throw Error('No pudimos abrir esta práctica. Vuelve a intentarlo.');
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error && cause.message.startsWith('No pudimos') ? cause.message : 'No pudimos abrir esta práctica. Vuelve a intentarlo; tu progreso se conserva.');
    } finally { starting.current = false; if (mounted.current) setBusy(false); }
  }
  return <div className="learner-home roadmap-home">
    <p className="welcome">Paso a paso, a tu ritmo.</p>
    {route ? <>
      <div className="roadmap-summary">
        <p>Objetivo semanal: <strong>{route.sourceSnapshot.goal.minutesPerDay * route.sourceSnapshot.goal.daysPerWeek} minutos · {route.sourceSnapshot.goal.daysPerWeek} días</strong></p>
        {metrics && <p>{metrics.activeMinutes.toFixed(1)} minutos practicados esta semana</p>}
        <label htmlFor="roadmap-progress">{completed} de {route.activities.length} pasos completados</label>
        <progress id="roadmap-progress" value={completed} max={Math.max(1, route.activities.length)} />
      </div>
      {route.adaptedAt && <p className="adaptation-note">He adaptado las próximas prácticas según lo que estás trabajando.</p>}
      {current && <section className="home-card current-step" aria-labelledby="current-step-title" data-activity={current.id}>
        <p className="eyebrow">Tu siguiente paso</p>
        <h2 id="current-step-title">{current.title}</h2>
        <p>{current.targetMinutes} minutos · {current.type === 'vocabulary-review' ? 'Un repaso breve para recordar tus expresiones.' : current.type === 'recurring-issue-practice' ? 'Practica con ayuda un aspecto que aparece en tus conversaciones.' : 'Una conversación cotidiana para ganar confianza.'}</p>
        <button className="roadmap-continue" disabled={busy} onClick={() => void start()}>{busy ? 'Abriendo tu práctica…' : 'Continuar mi ruta'}</button>
      </section>}
      <section aria-labelledby="roadmap-timeline-title" className="roadmap-timeline">
        <h2 id="roadmap-timeline-title">Tu camino, paso a paso</h2>
        <ol>
          {route.activities.filter(a => ['completed', 'started', 'pending'].includes(a.state)).map(activity => <li key={activity.id}
            className={activity.id === current?.id ? 'current' : activity.state === 'completed' ? 'completed' : ''}
            aria-current={activity.id === current?.id ? 'step' : undefined}>
            <span className="step-marker" aria-hidden="true">{activity.state === 'completed' ? '✓' : activity.id === current?.id ? '→' : '○'}</span>
            <div><h3>{activity.title}</h3><p>{activity.state === 'completed' ? 'Completada' : activity.id === current?.id ? 'Ahora' : 'Próximamente'} · {activity.targetMinutes} minutos</p></div>
          </li>)}
        </ol>
      </section>
    </> : !error && <p role="status">Preparando tu ruta…</p>}
    {error && <div><p role="alert">{error}</p>{!route && <button className="secondary" onClick={() => setReload(value => value + 1)}>Volver a intentar</button>}</div>}
    <div className="free-practice"><button className="secondary" onClick={onPractice}>Práctica libre</button><p>Opcional: elige lo que te apetezca practicar hoy.</p></div>
  </div>;
}
