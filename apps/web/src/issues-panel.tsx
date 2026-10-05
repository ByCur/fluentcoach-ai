import { useEffect, useState } from 'react';
import type { RecurringIssue } from '@fluentcoach/domain';
export function IssuesPanel({ csrf }: { csrf: string }) {
  const [issues, setIssues] = useState<RecurringIssue[]>([]);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/v1/issues', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw Error('No pudimos cargar tus prioridades.');
        const result = (await response.json()) as RecurringIssue[];
        if (active) {
          setIssues(result);
          setError('');
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : 'Prioridades no disponibles.',
          );
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [reload]);
  const change = async (key: string, action: 'dismiss' | 'restore') => {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/issues/${key}/${action}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf, 'content-type': 'application/json' },
        body: '{}',
      });
      if (!response.ok)
        throw Error('No pudimos guardar el cambio. Vuelve a intentarlo.');
      setReload((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cambio no disponible.');
    } finally {
      setBusy(false);
    }
  };
  const active = issues.filter((issue) => !issue.dismissed);
  const dismissed = issues.filter((issue) => issue.dismissed);
  return (
    <section aria-label="Prioridades recurrentes">
      <h2>Prioridades recurrentes</h2>
      <p>
        Detectado en varias sesiones: prioridades de práctica, sin evaluar ni
        certificar tu nivel.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => setReload((value) => value + 1)}
      >
        Actualizar prioridades
      </button>
      {error && <p role="alert">{error}</p>}
      {!active.length && !error && (
        <p>Aún no hay prioridades recurrentes activas.</p>
      )}
      {active.map((issue) => (
        <article key={issue.issueKey}>
          <h3>{issue.label}</h3>
          <p>
            {issue.observationCount} observaciones · {issue.sessionCount}{' '}
            sesiones · últimos 30 días
          </p>
          <p>
            Última práctica:{' '}
            {new Date(issue.lastOccurredAt).toLocaleDateString('es')}
          </p>
          <details>
            <summary>Ver ejemplos · {issue.label}</summary>
            {issue.evidence.map((observation) => (
              <blockquote
                key={`${observation.sessionId}:${observation.evidence.turnSequence}`}
              >
                <cite>
                  Sesión {observation.sessionId.slice(0, 8)} · revisión{' '}
                  {observation.revision} · tu turno{' '}
                  {observation.evidence.turnSequence}
                </cite>
                <p>{observation.evidence.quote}</p>
                <small>
                  Incertidumbre del informe: {observation.uncertainty}
                </small>
              </blockquote>
            ))}
          </details>
          <button
            disabled={busy}
            onClick={() => void change(issue.issueKey, 'dismiss')}
          >
            Descartar · {issue.label}
          </button>
        </article>
      ))}
      {!!dismissed.length && (
        <details>
          <summary>Prioridades descartadas</summary>
          <p>
            Siguen descartadas aunque llegue nueva evidencia, hasta que las
            restaures.
          </p>
          {dismissed.map((issue) => (
            <p key={issue.issueKey}>
              {issue.label}{' '}
              <button
                disabled={busy}
                onClick={() => void change(issue.issueKey, 'restore')}
              >
                Restaurar · {issue.label}
              </button>
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
