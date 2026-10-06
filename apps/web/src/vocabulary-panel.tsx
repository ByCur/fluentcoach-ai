import { useCallback, useEffect, useState } from 'react';
type Suggestion = {id: string; phrase: string; meaning: string | null};
type Card = {id: string; phrase: string; meaning: string | null; dueAt: string; version: number; state?: string};
export function VocabularyPanel({csrf, targetCardIds, onComplete}: {
  csrf: string;
  targetCardIds?: readonly string[] | null;
  onComplete?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [due, setDue] = useState<Card[]>([]);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      // The owned card list lets a route resume its exact short group even outside the general due page.
      if (targetCardIds) {
        const response = await fetch('/api/v1/vocabulary/cards', {credentials: 'include', signal: AbortSignal.timeout(10000)});
        if (!response.ok) throw Error('LOAD_FAILED');
        const cards = await response.json() as Card[];
        setDue(cards.filter(card => targetCardIds.includes(card.id) && card.state === 'active' && Date.parse(card.dueAt) <= Date.now()));
      } else {
        const [suggestionResponse, dueResponse] = await Promise.all([
          fetch('/api/v1/vocabulary/suggestions', {credentials: 'include'}),
          fetch('/api/v1/vocabulary/reviews/due?limit=20', {credentials: 'include'}),
        ]);
        if (!suggestionResponse.ok || !dueResponse.ok) throw Error('LOAD_FAILED');
        setSuggestions(await suggestionResponse.json() as Suggestion[]);
        setDue(await dueResponse.json() as Card[]);
      }
      setLoaded(true);
      setError('');
    } catch {setError('No pudimos cargar tu vocabulario. Vuelve a intentarlo; tus repasos se conservan.');}
  }, [targetCardIds]);
  useEffect(() => {void load();}, [load]);
  useEffect(() => {
    if (targetCardIds && loaded && !busy && !error && !due.length) onComplete?.();
  }, [targetCardIds, loaded, busy, error, due.length, onComplete]);
  const post = async (path: string, body: unknown = {}) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/v1/vocabulary' + path, {method: 'POST', credentials: 'include',
        headers: {'content-type': 'application/json', 'x-csrf-token': csrf}, body: JSON.stringify(body)});
      if (response.ok) await load();
      else setError('No pudimos guardar este repaso. Actualiza el vocabulario y vuelve a intentarlo.');
      return response;
    } catch {setError('No pudimos guardar este repaso. Vuelve a intentarlo.'); return null;}
    finally {setBusy(false);}
  };
  const review = async (card: Card, rating: 'again' | 'hard' | 'good' | 'easy') => {
    const response = await post(`/cards/${card.id}/reviews`, {rating, reviewKey: crypto.randomUUID(), expectedVersion: card.version});
    if (response?.ok) {
      const result = await response.json() as {card: Card};
      setNext(new Intl.DateTimeFormat('es', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(result.card.dueAt)));
    }
  };
  return <section aria-labelledby="vocabulary-title" className="vocabulary">
    <h2 id="vocabulary-title">{targetCardIds ? 'Un repaso breve' : 'Mi vocabulario'}</h2>
    <button className="secondary" disabled={busy} onClick={() => void load()}>Actualizar vocabulario</button>
    {error && <p role="alert">{error}</p>}
    {!loaded && !error && <p role="status">Cargando tus expresiones…</p>}
    {!targetCardIds && <>
      {!suggestions.length && <p>No hay sugerencias pendientes.</p>}
      {suggestions.map(suggestion => <article key={suggestion.id}><h3>{suggestion.phrase}</h3>{suggestion.meaning && <p>{suggestion.meaning}</p>}<div>
        <button disabled={busy} onClick={() => void post(`/suggestions/${suggestion.id}/confirm`)}>Añadir al repaso</button>{' '}
        <button className="secondary" disabled={busy} onClick={() => void post(`/suggestions/${suggestion.id}/ignore`)}>Ignorar</button>
      </div></article>)}
      <h2>Repaso de hoy</h2>
    </>}
    {targetCardIds && loaded && <p>{due.length} expresiones por repasar. Después continuarás tu ruta.</p>}
    {loaded && !due.length && <p>Ya terminaste el repaso pendiente.</p>}
    {due[0] && <article data-testid="due-card"><h3>{due[0].phrase}</h3>{due[0].meaning && <p>{due[0].meaning}</p>}<div className="ratings">
      {([['again', 'Otra vez'], ['hard', 'Difícil'], ['good', 'Bien'], ['easy', 'Fácil']] as const).map(([rating, label]) =>
        <button disabled={busy} key={rating} onClick={() => void review(due[0]!, rating)}>{label}</button>)}
    </div></article>}
    {next && <p role="status">Próximo repaso: {next}</p>}
  </section>;
}
