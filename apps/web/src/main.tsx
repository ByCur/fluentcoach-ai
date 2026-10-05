import { ReportPanel } from './report-panel.js';
import { SPEECH_RATES, useTutorSpeechPreferences } from './tutor-speech.js';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
const API = '/api/v1';
type ProfileResponse = {
  interfaceLanguage: string;
  nativeLanguage: string;
  timezone: string;
  cefrLevel: string;
  interests: string[];
};
type GoalResponse = { minutesPerDay: number; daysPerWeek: number };
type ConsentResponse = unknown[];
type CsrfResponse = { csrfToken: string };
type SessionResponse = {
  id: string;
  turns: { speaker: string; text: string }[];
  events: { sequence: number }[];
};
type Data = {
  interfaceLanguage: string;
  nativeLanguage: string;
  timezone: string;
  cefrLevel: string;
  interests: string;
  minutesPerDay: number;
  daysPerWeek: number;
  accepted: boolean;
};
const initial: Data = {
  interfaceLanguage: 'es',
  nativeLanguage: 'es',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  cefrLevel: 'A1',
  interests: 'viajes',
  minutesPerDay: 10,
  daysPerWeek: 3,
  accepted: false,
};
function App() {
  const [auth, setAuth] = useState(false),
    [csrf, setCsrf] = useState(''),
    [data, setData] = useState(initial),
    [step, setStep] = useState(1),
    [message, setMessage] = useState(''),
    [practice, setPractice] = useState(false),
    [scenario, setScenario] = useState('restaurant'),
    [mode, setMode] = useState('natural'),
    [session, setSession] = useState<{
      id: string;
      turns: { speaker: string; text: string }[];
    } | null>(null),
    [text, setText] = useState(''),
    [history, setHistory] = useState<
      { id: string; snapshot: { scenarioSlug: string }; state: string }[]
    >([]),
    [cursor, setCursor] = useState(0),
    [streamed, setStreamed] = useState(''),
    [reportId, setReportId] = useState<string | null>(null),
    [providerError, setProviderError] = useState(''),
    [busy, setBusy] = useState(false),
    [turnKey, setTurnKey] = useState(''),
    [voiceState, setVoiceState] = useState<
      'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking'
    >('idle'),
    [muted, setMuted] = useState(false),
    [level, setLevel] = useState('A1');
  const cursorRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(0);
  const spokenTurnCountRef = useRef(0);
  const speech = useTutorSpeechPreferences();
  const reconcileSession = (record: SessionResponse) => {
    cursorRef.current = record.events.reduce(
      (latest, event) => Math.max(latest, event.sequence),
      cursorRef.current,
    );
    setCursor(cursorRef.current);
    setSession(record);
    setStreamed('');
  };
  const api = async (path: string, options: RequestInit = {}) =>
    fetch(API + path, {
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      ...options,
    });
  useEffect(() => {
    void api('/me').then(async (r) => {
      if (!r.ok) return;
      const [p, g, c, csrfResponse] = await Promise.all([
        api('/learner-profile'),
        api('/practice-goal'),
        api('/consent'),
        api('/auth/csrf'),
      ]);
      const pv = (await p.json()) as ProfileResponse | null,
        gv = (await g.json()) as GoalResponse | null,
        cv = (await c.json()) as ConsentResponse,
        csrfBody = (await csrfResponse.json()) as CsrfResponse;
      setCsrf(csrfBody.csrfToken);
      setAuth(true);
      if (pv)
        setData((x) => ({
          ...x,
          ...pv,
          interests: pv.interests.join(', '),
          ...(gv ?? {}),
          accepted: cv.length > 0,
        }));
    });
  }, []);
  useEffect(() => {
    if (!session || !practice) return;
    const source = new EventSource(
      `${API}/sessions/${session.id}/events?cursor=${cursorRef.current}`,
      { withCredentials: true },
    );
    source.onmessage = (event) => {
      const value = JSON.parse(String(event.data)) as {
        sequence: number;
        kind: string;
        payload?: { text?: string };
      };
      if (value.sequence <= cursorRef.current) return;
      cursorRef.current = value.sequence;
      setCursor(value.sequence);
      if (value.kind === 'provider.failed') {
        setProviderError(
          'El proveedor no está disponible. Tu respuesta se conserva; puedes volver a intentarlo.',
        );
        setStreamed('');
      }
      if (value.kind === 'tutor.delta' && value.payload?.text)
        setStreamed((current) => current + value.payload!.text!);
    };
    return () => source.close();
  }, [session?.id, practice]);
  useEffect(() => {
    if (!session || !('speechSynthesis' in window)) return;
    const tutorTurns = session.turns.filter((turn) => turn.speaker === 'tutor');
    if (tutorTurns.length <= spokenTurnCountRef.current) return;
    spokenTurnCountRef.current = tutorTurns.length;
    if (muted) return;
    const utterance = new SpeechSynthesisUtterance(tutorTurns.at(-1)!.text);
    utterance.voice = speech.voice;
    utterance.lang = utterance.voice?.lang ?? 'en-US';
    utterance.rate = speech.rate;
    utterance.pitch = 1;
    utterance.onstart = () => setVoiceState('speaking');
    utterance.onend = utterance.onerror = () => setVoiceState('idle');
    window.speechSynthesis.speak(utterance);
  }, [session, muted, speech.voice, speech.rate]);
  const login = async () => {
    const r = await api('/auth/synthetic-login', {
      method: 'POST',
      body: JSON.stringify({ subject: 'learner-demo' }),
    });
    const b = (await r.json()) as CsrfResponse;
    setCsrf(b.csrfToken);
    setAuth(true);
  };
  const save = async () => {
    if (!data.accepted) {
      setMessage('Debes aceptar la divulgación para continuar.');
      return;
    }
    const body = {
      profile: {
        interfaceLanguage: data.interfaceLanguage,
        nativeLanguage: data.nativeLanguage,
        timezone: data.timezone,
        cefrLevel: data.cefrLevel,
        interests: data.interests
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
      },
      goal: {
        minutesPerDay: data.minutesPerDay,
        daysPerWeek: data.daysPerWeek,
      },
      consent: {
        // Legacy wire identifiers remain compatible with existing consent records.
        purpose: 'gemini-free-ai-practice',
        policyVersion: 'privacy-2026-09-29',
        providerDisclosureVersion: 'gemini-free-2026-09-29',
        accepted: true,
      },
    };
    const r = await api('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setMessage(
      r.ok
        ? 'Configuración guardada. Tu perfil está listo.'
        : 'No pudimos guardar. Revisa los campos.',
    );
  };
  if (practice) {
    const checked = async (path: string, options: RequestInit = {}) => {
      const response = await api(path, options);
      if (!response.ok) {
        const body = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        throw Error(
          body.error?.message ??
            'El proveedor no está disponible. Puedes volver a intentarlo.',
        );
      }
      return response;
    };
    const start = async () => {
      try {
        setProviderError('');
        cursorRef.current = 0;
        setCursor(0);
        setStreamed('');
        setTurnKey('');
        spokenTurnCountRef.current = 0;
        const r = await checked('/sessions', {
          method: 'POST',
          body: JSON.stringify({
            scenarioSlug: scenario,
            level,
            mode,
          }),
        });
        setSession(
          (await r.json()) as {
            id: string;
            turns: { speaker: string; text: string }[];
          },
        );
      } catch (e) {
        setProviderError(
          e instanceof Error ? e.message : 'Sesión no disponible.',
        );
      }
    };
    const send = async () => {
      if (!session || busy || !text.trim()) return;
      setBusy(true);
      setProviderError('');
      setStreamed('');
      const key = turnKey || crypto.randomUUID();
      setTurnKey(key);
      try {
        const r = await checked(`/sessions/${session.id}/turns`, {
          method: 'POST',
          body: JSON.stringify({ sourceEventKey: key, text }),
        });
        reconcileSession((await r.json()) as SessionResponse);
        setText('');
        setTurnKey('');
      } catch (e) {
        setProviderError(
          e instanceof Error
            ? e.message
            : 'El proveedor no está disponible. Puedes volver a intentarlo.',
        );
      } finally {
        setBusy(false);
      }
    };
    const stopSpeech = () => {
      window.speechSynthesis?.cancel();
      setVoiceState('idle');
    };
    const startRecording = async () => {
      if (busy || voiceState !== 'idle') return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const preferred = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
        ].find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = new MediaRecorder(
          stream,
          preferred ? { mimeType: preferred } : undefined,
        );
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size) audioChunksRef.current.push(event.data);
        };
        recorder.onstop = () =>
          stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = recorder;
        recordingStartedRef.current = Date.now();
        recorder.start();
        setVoiceState('recording');
      } catch {
        setProviderError(
          'No se concedió permiso para usar el micrófono. Puedes escribir tu respuesta.',
        );
      }
    };
    const stopAndSend = async () => {
      const recorder = recorderRef.current;
      if (!session || !recorder || recorder.state === 'inactive') return;
      const durationMs = Math.max(1, Date.now() - recordingStartedRef.current);
      const stopped = new Promise<void>((resolve) =>
        recorder.addEventListener('stop', () => resolve(), { once: true }),
      );
      recorder.stop();
      await stopped;
      if (durationMs > 30_000) {
        setProviderError('El turno de voz debe durar como máximo 30 segundos.');
        setVoiceState('idle');
        return;
      }
      const blob = new Blob(audioChunksRef.current, {
        type: recorder.mimeType || 'audio/webm',
      });
      if (!blob.size || blob.size > 8 * 1024 * 1024) {
        setProviderError('El audio está vacío o supera el límite de 8 MiB.');
        setVoiceState('idle');
        return;
      }
      setBusy(true);
      setProviderError('');
      setVoiceState('transcribing');
      setStreamed('');
      const form = new FormData();
      form.set('audio', blob, 'spoken-turn.webm');
      form.set('durationMs', String(durationMs));
      form.set('sourceEventKey', crypto.randomUUID());
      try {
        setVoiceState('thinking');
        const response = await fetch(
          `${API}/sessions/${session.id}/voice-turns`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'x-csrf-token': csrf },
            body: form,
          },
        );
        if (!response.ok) {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          throw Error(body.error?.message ?? 'No pudimos procesar el audio.');
        }
        reconcileSession((await response.json()) as SessionResponse);
        setVoiceState('idle');
      } catch (error) {
        setProviderError(
          error instanceof Error
            ? error.message
            : 'No pudimos procesar el audio.',
        );
        setVoiceState('idle');
      } finally {
        setBusy(false);
        recorderRef.current = null;
      }
    };
    const help = async () => {
      if (!session || busy) return;
      try {
        const r = await checked(`/sessions/${session.id}/help`, {
          method: 'POST',
        });
        setSession(
          (await r.json()) as {
            id: string;
            turns: { speaker: string; text: string }[];
          },
        );
      } catch (e) {
        setProviderError(
          e instanceof Error ? e.message : 'Ayuda no disponible.',
        );
      }
    };
    const end = async () => {
      if (!session) return;
      try {
        await checked(`/sessions/${session.id}/end`, { method: 'POST' });
        setReportId(session.id);
        setSession(null);
        setProviderError('');
        const r = await checked('/sessions');
        setHistory(
          (await r.json()) as {
            id: string;
            snapshot: { scenarioSlug: string };
            state: string;
          }[],
        );
      } catch (e) {
        setProviderError(
          e instanceof Error
            ? e.message
            : 'No pudimos terminar. Puedes volver a intentarlo.',
        );
      }
    };
    return (
      <main>
        <header>
          <div>
            <p className="eyebrow">FluentCoach AI</p>
            <h1>Práctica en inglés</h1>
          </div>
          <button className="secondary" onClick={() => setPractice(false)}>
            Perfil
          </button>
        </header>
        {providerError && <p role="alert">{providerError}</p>}
        {reportId && (
          <ReportPanel
            sessionId={reportId}
            csrf={csrf}
            onClose={() => setReportId(null)}
          />
        )}{' '}
        {!session ? (
          <section>
            <label>
              Escenario
              <select
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                {[
                  'restaurant',
                  'travel',
                  'hotel',
                  'shopping',
                  'doctor-visit',
                  'free-conversation',
                ].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nivel de práctica
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {['A1', 'A2', 'B1', 'B2'].map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Modo
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="natural">Conversación natural</option>
                <option value="teaching">Modo enseñanza</option>
              </select>
            </label>
            <button onClick={() => void start()}>Iniciar sesión</button>
            <button
              className="secondary"
              onClick={() =>
                void api('/sessions').then(async (r) =>
                  setHistory(
                    (await r.json()) as {
                      id: string;
                      snapshot: { scenarioSlug: string };
                      state: string;
                    }[],
                  ),
                )
              }
            >
              Ver historial
            </button>
            {history.map((h) => (
              <div key={h.id}>
                <p data-session-history={h.id}>
                  {h.snapshot.scenarioSlug} · {h.state}
                </p>
                {['ended', 'abandoned'].includes(h.state) && (
                  <button
                    className="secondary"
                    onClick={() => setReportId(h.id)}
                  >
                    Ver informe · {h.snapshot.scenarioSlug}
                  </button>
                )}
              </div>
            ))}
          </section>
        ) : (
          <section>
            <div
              aria-live="polite"
              data-cursor={cursor}
              data-session={session.id}
            >
              {session.turns.map((t, i) => (
                <p key={i}>
                  <strong>{t.speaker}:</strong> {t.text}
                </p>
              ))}
              {streamed && (
                <p data-testid="tutor-stream">
                  <strong>stream:</strong> {streamed}
                </p>
              )}
            </div>
            <label>
              Tu respuesta
              <input
                value={text}
                readOnly={busy || !!turnKey}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void send();
                }}
              />
            </label>
            <div className="voice-controls">
              <p role="status" aria-live="polite">
                Voz: {voiceState === 'idle' ? 'lista' : voiceState}
              </p>
              {voiceState === 'recording' ? (
                <button type="button" onClick={() => void stopAndSend()}>
                  Detener y enviar
                </button>
              ) : (
                <button type="button" disabled={busy || voiceState !== 'idle'} onClick={() => void startRecording()}>
                  Iniciar turno de voz
                </button>
              )}
              <button className="secondary" type="button" onClick={() => { setMuted((value) => !value); stopSpeech(); }}>
                {muted ? 'Activar voz del tutor' : 'Silenciar voz del tutor'}
              </button>
              <button className="secondary" type="button" onClick={stopSpeech}>
                Detener voz del tutor
              </button>
              <label>
                Voz del tutor
                <select
                  value={speech.voice?.voiceURI ?? ''}
                  onChange={(event) => speech.selectVoice(event.target.value)}
                  disabled={!speech.voices.length}
                >
                  {!speech.voices.length && <option value="">Predeterminada del navegador</option>}
                  {speech.voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} · {voice.lang}{voice.localService ? ' · local' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Velocidad
                <select value={speech.rate} onChange={(event) => speech.selectRate(Number(event.target.value))}>
                  {SPEECH_RATES.map((rate) => <option key={rate} value={rate}>{rate.toFixed(2)}x</option>)}
                </select>
              </label>
              <small>
                La reproducción usa la voz del navegador; FluentCoach no paga una API de TTS y no garantiza que funcione sin conexión.
              </small>
            </div>
            <nav>
              <button disabled={busy} onClick={() => void send()}>
                {busy
                  ? 'Esperando respuesta…'
                  : turnKey
                    ? 'Reintentar respuesta'
                    : 'Enviar'}
              </button>
              <button className="secondary" onClick={() => void help()}>
                Ayuda en español
              </button>
              <button className="secondary" onClick={() => void end()}>
                Terminar
              </button>
            </nav>
          </section>
        )}
      </main>
    );
  }
  if (!auth)
    return (
      <main className="signed">
        <p className="eyebrow">FluentCoach AI</p>
        <h1>Practica inglés con confianza.</h1>
        <p>Tu espacio privado para avanzar paso a paso.</p>
        <button onClick={() => void login()}>
          Entrar con identidad de desarrollo
        </button>
        <small>
          En producción, el acceso será mediante el proveedor OIDC invitado.
        </small>
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">FluentCoach AI</p>
          <h1>Prepara tu aprendizaje</h1>
        </div>
        <span aria-label={`Paso ${step} de 3`}>Paso {step} de 3</span>
        <button className="secondary" onClick={() => setPractice(true)}>
          Practicar
        </button>
      </header>
      <div className="progress">
        <i style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      {step === 1 && (
        <section>
          <h2>Cuéntanos sobre ti</h2>
          <label>
            Idioma de la interfaz
            <select
              value={data.interfaceLanguage}
              onChange={(e) =>
                setData({ ...data, interfaceLanguage: e.target.value })
              }
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            Idioma nativo
            <input
              value={data.nativeLanguage}
              onChange={(e) =>
                setData({ ...data, nativeLanguage: e.target.value })
              }
            />
          </label>
          <label>
            Zona horaria
            <input
              value={data.timezone}
              onChange={(e) => setData({ ...data, timezone: e.target.value })}
            />
          </label>
          <fieldset>
            <legend>Tu nivel de inglés</legend>
            <div className="levels">
              {['A1', 'A2', 'B1', 'B2'].map((x) => (
                <label key={x}>
                  <input
                    type="radio"
                    name="level"
                    checked={data.cefrLevel === x}
                    onChange={() => setData({ ...data, cefrLevel: x })}
                  />
                  {x}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Intereses (separados por comas)
            <input
              value={data.interests}
              onChange={(e) => setData({ ...data, interests: e.target.value })}
            />
          </label>
        </section>
      )}
      {step === 2 && (
        <section>
          <h2>Tu ritmo de práctica</h2>
          <p>Te proponemos 10 minutos, 3 días por semana. Puedes cambiarlo.</p>
          <label>
            Minutos por día
            <input
              type="number"
              min="5"
              max="120"
              value={data.minutesPerDay}
              onChange={(e) =>
                setData({ ...data, minutesPerDay: +e.target.value })
              }
            />
          </label>
          <label>
            Días por semana
            <input
              type="number"
              min="1"
              max="7"
              value={data.daysPerWeek}
              onChange={(e) =>
                setData({ ...data, daysPerWeek: +e.target.value })
              }
            />
          </label>
        </section>
      )}
      {step === 3 && (
        <section>
          <h2>Privacidad y práctica con IA</h2>
          <div className="notice">
            <strong>Privacidad · práctica local con IA</strong>
            <p>
              Por defecto, Ollama genera las respuestas del tutor y whisper.cpp
              transcribe tu voz en el equipo local. La reproducción usa
              speechSynthesis del navegador. El uso normal no tiene coste
              recurrente de API de IA.
            </p>
            <p>
              FluentCoach conserva la transcripción y las respuestas, pero no
              almacena audio sin procesar. Las voces disponibles dependen del
              navegador y del sistema; no se garantiza que funcionen sin conexión.
            </p>
            <p>
              Gemini es una opción explícita para el futuro, no el proveedor
              predeterminado. No se envía contenido a Gemini por defecto ni se
              cambia a Gemini automáticamente. Su uso requiere configuración
              explícita y una revisión de sus condiciones de privacidad.
              Puedes decidir no continuar con la práctica basada en IA.
            </p>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={data.accepted}
              onChange={(e) => setData({ ...data, accepted: e.target.checked })}
            />
            He leído y acepto explícitamente esta divulgación.
          </label>
        </section>
      )}
      <nav>
        {step > 1 && (
          <button className="secondary" onClick={() => setStep(step - 1)}>
            Atrás
          </button>
        )}
        {step < 3 ? (
          <button onClick={() => setStep(step + 1)}>Continuar</button>
        ) : (
          <button onClick={() => void save()}>Aceptar y guardar</button>
        )}
      </nav>
      <p role="status">{message}</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
