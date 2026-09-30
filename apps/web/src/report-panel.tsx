import { useEffect, useState } from 'react';
type Finding = {
  text: string;
  explanation: string;
  practice: string;
  uncertainty: string;
  evidence: {
    turnSequence: number;
    start: number;
    end: number;
    quote: string;
  }[];
};
type View = {
  status: string;
  errorCode?: string;
  partial: boolean;
  revision: number;
  report?: { strengths: Finding[]; corrections: Finding[] };
};
export function ReportPanel({
  sessionId,
  csrf,
  onClose,
}: {
  sessionId: string;
  csrf: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<View | null>(null),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const response = await fetch(`/api/v1/sessions/${sessionId}/report`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok)
          throw Error(
            'No pudimos cargar el informe. Puedes volver a intentarlo.',
          );
        const next = (await response.json()) as View;
        if (active) {
          setView(next);
          setError('');
          if (['pending', 'running'].includes(next.status))
            timer = setTimeout(() => void poll(), 1000);
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : 'Informe no disponible.');
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, reload]);
  const retry = async () => {
    try {
      const response = await fetch(
        `/api/v1/sessions/${sessionId}/report/retry`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'x-csrf-token': csrf },
        },
      );
      if (!response.ok)
        throw Error('No pudimos reintentar. Tu sesión se conserva.');
      setView((await response.json()) as View);
      setReload((x) => x + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Informe no disponible.');
    }
  };
  return (
    <section aria-label="Informe de sesión">
      <h2>Informe de sesión</h2>
      <p role="status">
        {error ||
          (!view
            ? 'Cargando informe…'
            : view.status === 'pending'
              ? 'Informe pendiente'
              : view.status === 'running'
                ? 'Preparando informe…'
                : view.status === 'failed'
                  ? `No pudimos generar el informe (${view.errorCode ?? 'proveedor no disponible'}). Tu sesión se conserva.`
                  : view.status === 'skipped'
                    ? 'Sin respuestas para analizar. No se ha generado feedback.'
                    : 'Informe listo')}
      </p>
      {error ? (
        <button onClick={() => setReload((x) => x + 1)}>Volver a cargar</button>
      ) : (
        view?.status === 'failed' && (
          <button onClick={() => void retry()}>Reintentar informe</button>
        )
      )}
      {view?.report && (
        <>
          <p>
            {view.partial ? 'Informe parcial · ' : ''}Revisión {view.revision}.
            Práctica escrita; no certifica tu nivel ni evalúa pronunciación.
          </p>
          {(['strengths', 'corrections'] as const).map((key) => (
            <div key={key}>
              <h3>
                {key === 'strengths'
                  ? 'Fortalezas'
                  : 'Correcciones prioritarias'}
              </h3>
              {view.report![key].length === 0 && (
                <p>No hay correcciones respaldadas por evidencia suficiente.</p>
              )}
              {view.report![key].map((finding, i) => (
                <article key={i}>
                  <h4>{finding.text}</h4>
                  <p>{finding.explanation}</p>
                  {finding.evidence.map((e, j) => (
                    <blockquote key={j}>
                      <cite>Tu turno {e.turnSequence}</cite>
                      <p>{e.quote}</p>
                    </blockquote>
                  ))}
                  <p>Práctica: {finding.practice}</p>
                  <small>Incertidumbre: {finding.uncertainty}</small>
                </article>
              ))}
            </div>
          ))}
        </>
      )}
      <button className="secondary" onClick={onClose}>
        Cerrar informe
      </button>
    </section>
  );
}
