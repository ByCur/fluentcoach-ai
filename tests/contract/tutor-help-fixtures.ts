import type { ConversationTurn } from '@fluentcoach/domain';

export const HELP_EXAMPLES = [
  {
    tutor: 'How can I help you today?',
    response: 'Te he preguntado: «¿En qué puedo ayudarte hoy?»\nHow can I help you?',
  },
  {
    tutor: 'Would you prefer a single room or a double room?',
    response: 'Te estoy preguntando si prefieres una habitación individual o doble.\nSingle room or double room?',
  },
];

export function helpTurns(tutor: string): ConversationTurn[] {
  return [
    { sequence: 1, sourceEventKey: 'old', speaker: 'tutor', text: 'Would you like tea or coffee?', language: 'en' },
    { sequence: 2, sourceEventKey: 'latest', speaker: 'tutor', text: tutor, language: 'en' },
    { sequence: 3, sourceEventKey: 'help', speaker: 'help', text: 'Ayuda anterior', language: 'es' },
    { sequence: 4, sourceEventKey: 'learner', speaker: 'learner', text: 'No entiendo.', language: 'en' },
  ];
}
