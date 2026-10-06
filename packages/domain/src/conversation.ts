/** Ordered adult everyday progression; levels are selected preferences, never assessment scores. */
export const SCENARIOS = [
  { slug: 'introductions', version: 1, title: 'Presentaciones y vida diaria', interests: ['vida diaria', 'daily life'] },
  { slug: 'past-experiences', version: 1, title: 'El fin de semana y experiencias pasadas', interests: ['fin de semana', 'experiencias'] },
  { slug: 'travel', version: 1, title: 'De viaje', interests: ['viajes', 'viajar', 'travel'] },
  { slug: 'hotel', version: 1, title: 'En un hotel', interests: ['viajes', 'travel', 'hoteles'] },
  { slug: 'restaurant', version: 1, title: 'En un restaurante', interests: ['cocina', 'comida', 'gastronomia', 'food', 'cooking'] },
  { slug: 'shopping', version: 1, title: 'De compras', interests: ['compras', 'shopping', 'moda'] },
  { slug: 'family-friends', version: 1, title: 'Familia y amigos', interests: ['familia', 'amigos', 'family'] },
  { slug: 'work', version: 1, title: 'En el trabajo', interests: ['trabajo', 'work', 'negocios'] },
  { slug: 'hobbies', version: 1, title: 'Tus aficiones', interests: ['lectura', 'deporte', 'musica', 'cine', 'hobbies', 'reading', 'sports', 'music'] },
  { slug: 'doctor-visit', version: 1, title: 'Salud y citas básicas', interests: ['salud', 'health'] },
  { slug: 'future-plans', version: 1, title: 'Planes para el futuro', interests: ['planes', 'futuro'] },
  { slug: 'opinions', version: 1, title: 'Comparte tus opiniones', interests: ['actualidad', 'opiniones'] },
  { slug: 'problem-solving', version: 1, title: 'Resuelve un problema cotidiano', interests: ['problemas', 'tecnologia'] },
  { slug: 'free-conversation', version: 1, title: 'Conversación libre', interests: [] },
] as const;
export type ConversationMode='natural'|'teaching'; export type SessionState='created'|'active'|'ended'|'abandoned'|'failed';
export interface SessionSnapshot {scenarioSlug:string;scenarioVersion:number;level:'A1'|'A2'|'B1'|'B2';mode:ConversationMode;promptVersion:string}
export interface ConversationTurn {sequence:number;sourceEventKey:string;speaker:'learner'|'tutor'|'help';text:string;language:'en'|'es'}
export function transitionSession(state:SessionState,next:SessionState):SessionState {if(state===next)return state;if(['ended','abandoned','failed'].includes(state))throw new Error('SESSION_TERMINAL');if((state==='created'&&next==='active')||(['created','active'].includes(state)&&['ended','abandoned','failed'].includes(next)))return next;throw new Error('INVALID_SESSION_TRANSITION')}
export function correctionPolicy(mode:ConversationMode){return mode==='natural'?'deferred':'after-turn'}
