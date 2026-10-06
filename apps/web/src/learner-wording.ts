import { SCENARIOS } from '@fluentcoach/domain';
export const scenarioLabels: Record<string, string> = Object.fromEntries(SCENARIOS.map(s => [s.slug, s.title]));
export const sessionLabels: Record<string, string> = {
  created: 'Lista para empezar', active: 'En curso', ended: 'Terminada',
  abandoned: 'Sin terminar', failed: 'No se pudo completar',
};
export const voiceLabels = {
  idle: 'lista', recording: 'grabando', transcribing: 'preparando tu respuesta',
  thinking: 'esperando al tutor', speaking: 'hablando el tutor',
};

export function suggestionUncertainty(value: string) {
  return value === 'high' ? 'Hay más dudas sobre esta sugerencia.'
    : value === 'medium' ? 'Hay algunas dudas sobre esta sugerencia.'
      : 'Hay pocas dudas sobre esta sugerencia.';
}
