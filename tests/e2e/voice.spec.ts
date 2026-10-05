import { expect, test } from '@playwright/test';

function installBrowserFakes(
  page: import('@playwright/test').Page,
  microphone: 'allowed' | 'denied',
) {
  return page.addInitScript((permission) => {
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
      value: class { text: string; lang = ''; voice: SpeechSynthesisVoice | null = null; onstart: (() => void) | null = null; onend = null; onerror = null; constructor(text: string) { this.text = text; } },
    });
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        getVoices: () => [{ lang: 'en-GB', name: 'Fake English' }],
        speak: (utterance: { onstart?: () => void }) => utterance.onstart?.(),
        cancel: () => { (window as unknown as { __speechCancelled: boolean }).__speechCancelled = true; },
      },
    });
  }, microphone);
}

async function enterPractice(page: import('@playwright/test').Page) {
  await page.goto('/');
  const login = page.getByRole('button', { name: /Entrar/ });
  if (await login.isVisible()) await login.click();
  await expect(page.getByRole('heading', { name: 'Prepara tu aprendizaje' })).toBeVisible();
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
