import { useEffect, useState } from 'react';

const VOICE_KEY = 'fluentcoach.tutorVoice';
const RATE_KEY = 'fluentcoach.tutorRate';
export const SPEECH_RATES = [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15];
const english = (voice: SpeechSynthesisVoice) => /^en([-_]|$)/i.test(voice.lang);

function readPreference(key: string): string {
  try { return window.localStorage.getItem(key) ?? ''; }
  catch { return ''; }
}
function savePreference(key: string, value: string) {
  // Storage can be blocked in private browsing; playback must still work.
  try { window.localStorage.setItem(key, value); }
  catch { /* Keep the preference in memory. */ }
}
function quality(voice: SpeechSynthesisVoice): number {
  // Prefer local voices first, then enhanced voices and the OS default.
  return Number(voice.localService) * 100 +
    Number(/natural|neural|enhanced|premium/i.test(voice.name)) * 10 +
    Number(voice.default);
}

export function useTutorSpeechPreferences() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [savedVoice, setSavedVoice] = useState(() => readPreference(VOICE_KEY));
  const [rate, setRate] = useState(() => {
    const saved = Number(readPreference(RATE_KEY));
    return SPEECH_RATES.includes(saved) ? saved : 0.95;
  });
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const synthesis = window.speechSynthesis;
    const loadVoices = () => setVoices(
      synthesis.getVoices().filter(english).sort((a, b) =>
        quality(b) - quality(a) || a.name.localeCompare(b.name) ||
        a.voiceURI.localeCompare(b.voiceURI)),
    );
    synthesis.addEventListener('voiceschanged', loadVoices);
    loadVoices();
    return () => synthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);
  const voice = voices.find((candidate) => candidate.voiceURI === savedVoice) ??
    voices.find((candidate) => candidate.localService) ?? voices[0] ?? null;
  return {
    voices, voice, rate,
    selectVoice: (value: string) => {
      setSavedVoice(value);
      savePreference(VOICE_KEY, value);
    },
    selectRate: (value: number) => {
      if (!SPEECH_RATES.includes(value)) return;
      setRate(value);
      savePreference(RATE_KEY, String(value));
    },
  };
}
