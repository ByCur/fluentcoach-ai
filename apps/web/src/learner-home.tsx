import { useEffect, useState } from 'react';
import type { LearningPlan } from '@fluentcoach/application';
import type { RecurringIssue, progressMetrics } from '@fluentcoach/domain';
import type { LearnerPage } from './learner-navigation.js';

type Metrics = ReturnType<typeof progressMetrics>;
export function LearnerHome({ onNavigate, onPractice, continuing }: {
  onNavigate: (page: LearnerPage) => void;
  onPractice: () => void;
  continuing: boolean;
}) {
  const [plans, setPlans] = useState<{ active: LearningPlan | null; proposal: LearningPlan | null } | null>(null);
  const [issues, setIssues] = useState<RecurringIssue[] | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setErrors([]);
    async function read<T>(path: string, apply: (value: T) => void) {
      try {
        const response = await fetch(`/api/v1${path}`, { credentials: 'include', signal: controller.signal });
        if (!response.ok) throw Error('LOAD_FAILED');
        const value = await response.json() as T;
        if (!controller.signal.aborted) apply(value);
      } catch {
        if (!controller.signal.aborted) setErrors((current) => [...current, path]);
      }
    }
    void Promise.all([
      read('/plans/current', setPlans),
      read('/issues', setIssues),
      read('/progress', setMetrics),
    ]);
    return () => controller.abort();
  }, [reload]);
  const recommendations = (plans?.active ?? plans?.proposal)?.activities
    .filter((activity) => ['pending', 'started'].includes(activity.state)).slice(0, 2) ?? [];
  const priorities = issues?.filter((issue) => !issue.dismissed).slice(0, 2);
  const loading = (path: string) => errors.includes(path)
    ? <p role="status">No pudimos cargar esta información. Puedes volver a intentarlo.</p>
    : <p role="status">Cargando…</p>;
  return <div className="learner-home">
    <p className="welcome">Un poco de práctica, a tu ritmo.</p>
    <section className="home-card practice-card" aria-labelledby="home-practice">
      <h2 id="home-practice">{continuing ? 'Continuar práctica' : 'Practicar ahora'}</h2>
      <p>{continuing ? 'Retoma la conversación donde la dejaste.' : 'Elige una situación cotidiana y practica inglés paso a paso.'}</p>
      <button onClick={onPractice}>{continuing ? 'Continuar práctica' : 'Practicar ahora'}</button>
    </section>
    <section className="home-card" aria-labelledby="home-recommendations">
      <h2 id="home-recommendations">Recomendado para ti</h2>
      {!plans ? loading('/plans/current') : recommendations.length ? <ul className="summary-list">
        {recommendations.map((activity) => <li key={activity.id}>
          <h3>{activity.title}</h3><p>{activity.targetMinutes} minutos · {activity.rationale}</p>
        </li>)}
      </ul> : <p>{plans.active ? 'Has terminado las actividades de tu plan. Puedes preparar el siguiente.' : 'Tu plan te ayudará a elegir por dónde empezar, según tu nivel y tu ritmo.'}</p>}
      {!!metrics?.dueCards && <p>{metrics.dueCards} expresiones pendientes de repaso. <button className="text-button" onClick={() => onNavigate('vocabulary')}>Repasar mi vocabulario</button></p>}
      <button className="secondary" onClick={() => onNavigate('recommendations')}>Ver mis recomendaciones</button>
    </section>
    <section className="home-card" aria-labelledby="home-issues">
      <h2 id="home-issues">Lo que debo mejorar</h2>
      {!priorities ? loading('/issues') : priorities.length ? <ul className="summary-list">
        {priorities.map((issue) => <li key={issue.issueKey}><h3>{issue.label}</h3>
          <p>Lo hemos observado en {issue.sessionCount} prácticas durante los últimos 30 días.</p>
        </li>)}
      </ul> : <p>Aún no hay aspectos que se repitan en tus prácticas. Sigue practicando para descubrir en qué centrarte.</p>}
      <button className="secondary" onClick={() => onNavigate('issues')}>Ver mis ejemplos</button>
    </section>
    <section className="home-card" aria-labelledby="home-progress">
      <h2 id="home-progress">Mi progreso</h2>
      {!metrics ? loading('/progress') : <>
        <dl className="home-metrics">
          <div><dt>Minutos de práctica esta semana</dt><dd>{metrics.activeMinutes.toFixed(1)} de {metrics.targetMinutes}</dd></div>
          <div><dt>Días de práctica esta semana</dt><dd>{metrics.practicedDays} de {metrics.targetDays}</dd></div>
          <div><dt>Prácticas terminadas esta semana</dt><dd>{metrics.completedSessionsThisWeek}</dd></div>
        </dl>
        <p>Cuenta el tiempo de hablar y escribir. La espera no cuenta.</p>
      </>}
      <button className="secondary" onClick={() => onNavigate('progress')}>Ver mi progreso</button>
    </section>
    {!!errors.length && <button className="secondary" onClick={() => setReload((value) => value + 1)}>Volver a cargar</button>}
  </div>;
}
