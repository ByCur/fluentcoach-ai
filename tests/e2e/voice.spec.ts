import { expect, test, type Page } from '@playwright/test';

type SpeechProbe = {
  __voices: SpeechSynthesisVoice[];
  __spoken: { text: string; voiceURI: string | null; rate: number; pitch: number }[];
  __speechCancelled: boolean;
  __eventSources: EventSource[];
  __deltas: string[];
};
const browserVoices = [
  { voiceURI: 'spanish', lang: 'es-ES', name: 'Spanish', localService: true, default: true },
  { voiceURI: 'remote', lang: 'en-US', name: 'Remote Natural', localService: false, default: false },
  { voiceURI: 'basic', lang: 'en-US', name: 'Basic English', localService: true, default: false },
  { voiceURI: 'natural', lang: 'en-GB', name: 'Natural English', localService: true, default: false },
];
function installBrowserFakes(
  page: Page,
  microphone: 'allowed' | 'denied',
  delayedVoices = false,
) {
  return page.addInitScript(({ permission, voices, delayed }) => {
    const probe = window as unknown as SpeechProbe;
    probe.__voices = delayed ? [] : voices as SpeechSynthesisVoice[];
    probe.__spoken = [];
    probe.__speechCancelled = false;
    probe.__eventSources = [];
    probe.__deltas = [];
    const NativeEventSource = window.EventSource;
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options);
        probe.__eventSources.push(this);
        this.addEventListener('message', (event) => {
          const value = JSON.parse(String(event.data)) as { kind: string };
          if (value.kind === 'tutor.delta') probe.__deltas.push(String(event.data));
        });
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          if (permission === 'denied') {
            const error = new DOMException('Denied', 'NotAllowedError');
            (window as unknown as { __microphoneErrorName: string })
              .__microphoneErrorName = error.name;
            return Promise.reject(error);
          }
          return Promise.resolve({
            getTracks: () => [{ stop: () => undefined }],
          });
        },
      },
    });
    class FakeRecorder extends EventTarget {
      static isTypeSupported() { return true; }
      state: RecordingState = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType ?? this.mimeType;
      }
      start() { this.state = 'recording'; }
      stop() {
        this.ondataavailable?.({ data: new Blob(['fake-audio'], { type: this.mimeType }) } as BlobEvent);
        this.state = 'inactive';
        this.onstop?.();
        this.dispatchEvent(new Event('stop'));
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: class { text: string; lang = ''; rate = 1; pitch = 1; voice: SpeechSynthesisVoice | null = null; onstart: (() => void) | null = null; onend = null; onerror = null; constructor(text: string) { this.text = text; } },
    });
    const synthesis = new EventTarget();
    Object.assign(synthesis, {
      getVoices: () => probe.__voices,
      speak: (utterance: SpeechSynthesisUtterance) => {
        probe.__spoken.push({ text: utterance.text, voiceURI: utterance.voice?.voiceURI ?? null, rate: utterance.rate, pitch: utterance.pitch });
        utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
      },
      cancel: () => { probe.__speechCancelled = true; },
    });
    Object.defineProperty(window, 'speechSynthesis', { value: synthesis });
  }, { permission: microphone, voices: browserVoices, delayed: delayedVoices });
}

async function enterPractice(page: Page) {
  await page.goto('/');
  const login = page.getByRole('button', { name: /Entrar/ });
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole('heading', { name: 'Prepara tu aprendizaje' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceptar y guardar' }).click();
  await expect(page.getByRole('status')).toContainText('Configuración guardada');
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test('push-to-talk uses fake capture/transcription/TTS while text fallback stays usable', async ({ page }) => {
  await installBrowserFakes(page, 'allowed');
  await enterPractice(page);
  await page.getByRole('button', { name: 'Iniciar turno de voz' }).click();
  await expect(page.getByRole('status', { name: '' }).filter({ hasText: 'recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Detener y enviar' }).click();
  await expect(page.getByText(/learner:.*Synthetic spoken turn/)).toBeVisible();
  await expect(page.getByText(/tutor:.*Synthetic spoken turn/)).toBeVisible();
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  await page.getByRole('button', { name: 'Detener voz del tutor' }).click();
  expect(await page.evaluate(() => (window as unknown as { __speechCancelled: boolean }).__speechCancelled)).toBe(true);
  await page.getByLabel('Tu respuesta').fill('Text still works');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(/tutor:.*Text still works/)).toBeVisible();
});

test('microphone denial leaves text input usable', async ({ page }) => {
  await installBrowserFakes(page, 'denied');
  await enterPractice(page);
  await page.getByRole('button', { name: 'Iniciar turno de voz' }).click();
  await expect(page.getByRole('alert')).toContainText('permiso');
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __microphoneErrorName: string })
          .__microphoneErrorName,
    ),
  ).toBe('NotAllowedError');
  await expect(page.getByLabel('Tu respuesta')).toBeEnabled();
});

async function voiceTurn(page: Page) {
  await page.getByRole('button', { name: 'Iniciar turno de voz' }).click();
  await page.getByRole('button', { name: 'Detener y enviar' }).click();
}

test('voice streams live, reconciles persisted events, and ignores late duplicate deltas across turns', async ({ page }) => {
  await installBrowserFakes(page, 'allowed');
  await enterPractice(page);
  for (let turn = 1; turn <= 2; turn++) {
    let completed = false;
    const response = page.waitForResponse(r => r.url().endsWith('/voice-turns'))
      .then(r => { completed = true; return r; });
    await voiceTurn(page);
    await expect(page.getByTestId('tutor-stream')).toHaveText("stream: Let's continue: ");
    expect(completed).toBe(false);
    const record = await (await response).json() as { events: { sequence: number }[] };
    await expect(page.getByText(/tutor:.*Synthetic spoken turn/)).toHaveCount(turn);
    await expect(page.getByTestId('tutor-stream')).toHaveCount(0);
    await expect(page.locator('[data-cursor]')).toHaveAttribute('data-cursor', String(Math.max(...record.events.map(e => e.sequence))));
    // Replay actual received deltas after the POST: the persisted session already includes them.
    await page.evaluate(() => {
      const probe = window as unknown as SpeechProbe;
      for (const data of [...probe.__deltas]) {
        probe.__eventSources.at(-1)!.dispatchEvent(new MessageEvent('message', { data }));
      }
    });
    await expect(page.getByTestId('tutor-stream')).toHaveCount(0);
    await page.getByRole('button', { name: 'Detener voz del tutor' }).click();
  }
});

test('English local quality preference and selected voice/rate affect the next utterance and survive reload', async ({ page }) => {
  await installBrowserFakes(page, 'allowed');
  await enterPractice(page);
  const selector = page.getByRole('combobox', { name: 'Voz del tutor', exact: true });
  await expect(selector).toHaveValue('natural');
  expect(await selector.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value)))
    .toEqual(['natural', 'basic', 'remote']);
  await expect(page.getByLabel('Velocidad')).toHaveValue('0.95');
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)))
    .toMatchObject({ voiceURI: 'natural', rate: 0.95, pitch: 1 });
  await page.getByRole('button', { name: 'Detener voz del tutor' }).click();
  await selector.selectOption('basic');
  await page.getByLabel('Velocidad').selectOption('1.1');
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)))
    .toMatchObject({ voiceURI: 'basic', rate: 1.1, pitch: 1 });
  expect(await page.evaluate(() => [localStorage.getItem('fluentcoach.tutorVoice'), localStorage.getItem('fluentcoach.tutorRate')]))
    .toEqual(['basic', '1.1']);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Prepara tu aprendizaje' })).toBeVisible();
  await page.getByRole('button', { name: 'Practicar' }).click();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(selector).toHaveValue('basic');
  await expect(page.getByLabel('Velocidad')).toHaveValue('1.1');
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)))
    .toMatchObject({ voiceURI: 'basic', rate: 1.1 });
});

test('voiceschanged handles asynchronous arrival, unavailable saved voice, and disappearing voices safely', async ({ page }) => {
  await installBrowserFakes(page, 'allowed', true);
  await page.addInitScript(() => {
    localStorage.setItem('fluentcoach.tutorVoice', 'unavailable');
    localStorage.setItem('fluentcoach.tutorRate', '3');
  });
  await enterPractice(page);
  const selector = page.getByRole('combobox', { name: 'Voz del tutor', exact: true });
  await expect(selector).toBeDisabled();
  await expect(page.getByLabel('Velocidad')).toHaveValue('0.95');
  await page.evaluate((voices) => {
    (window as unknown as SpeechProbe).__voices = voices as SpeechSynthesisVoice[];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  }, browserVoices);
  await expect(selector).toHaveValue('natural');
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)?.voiceURI)).toBe('natural');
  await page.getByRole('button', { name: 'Detener voz del tutor' }).click();
  await page.evaluate(() => {
    const probe = window as unknown as SpeechProbe;
    probe.__voices = probe.__voices.filter(v => !v.localService);
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(selector).toHaveValue('remote');
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)?.voiceURI)).toBe('remote');
  await page.getByRole('button', { name: 'Detener voz del tutor' }).click();
  await page.evaluate(() => {
    (window as unknown as SpeechProbe).__voices = [];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  });
  await expect(selector).toBeDisabled();
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)?.voiceURI)).toBeNull();
});

test('a saved English voice arriving asynchronously is restored', async ({ page }) => {
  await installBrowserFakes(page, 'allowed', true);
  await page.addInitScript(() => localStorage.setItem('fluentcoach.tutorVoice', 'basic'));
  await enterPractice(page);
  await page.evaluate((voices) => {
    (window as unknown as SpeechProbe).__voices = voices as SpeechSynthesisVoice[];
    speechSynthesis.dispatchEvent(new Event('voiceschanged'));
  }, browserVoices);
  await expect(page.getByRole('combobox', { name: 'Voz del tutor', exact: true })).toHaveValue('basic');
});

test('blocked browser storage keeps voice/rate controls and playback usable', async ({ page }) => {
  await installBrowserFakes(page, 'allowed');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => { throw new DOMException('Blocked', 'SecurityError'); },
    });
  });
  await enterPractice(page);
  await page.getByRole('combobox', { name: 'Voz del tutor', exact: true }).selectOption('basic');
  await page.getByLabel('Velocidad').selectOption('1.15');
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken.at(-1)))
    .toMatchObject({ voiceURI: 'basic', rate: 1.15 });
});

test('mute prevents playback and unmute only speaks the next tutor turn; stop cancels synthesis', async ({ page }) => {
  await installBrowserFakes(page, 'allowed');
  await enterPractice(page);
  await page.getByRole('button', { name: 'Silenciar voz del tutor' }).click();
  await voiceTurn(page);
  await expect(page.getByText(/tutor:.*Synthetic spoken turn/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken)).toHaveLength(0);
  await page.getByRole('button', { name: 'Activar voz del tutor' }).click();
  await page.getByLabel('Velocidad').selectOption('0.85');
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken)).toHaveLength(0);
  await voiceTurn(page);
  await expect(page.getByText('Voz: speaking')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__spoken)).toHaveLength(1);
  await page.evaluate(() => { (window as unknown as SpeechProbe).__speechCancelled = false; });
  await page.getByRole('button', { name: 'Detener voz del tutor' }).click();
  expect(await page.evaluate(() => (window as unknown as SpeechProbe).__speechCancelled)).toBe(true);
  await expect(page.getByText('Voz: lista')).toBeVisible();
});
