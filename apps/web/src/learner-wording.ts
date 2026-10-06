export const scenarioLabels: Record<string, string> = {
  restaurant: 'En un restaurante',
  travel: 'De viaje',
  hotel: 'En un hotel',
  shopping: 'De compras',
  'doctor-visit': 'En el médico',
  'free-conversation': 'Conversación libre',
};
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
