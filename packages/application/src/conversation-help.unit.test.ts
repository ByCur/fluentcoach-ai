import { describe, expect, it, vi } from 'vitest';
import { ConversationService, type TutorContext } from './conversation.js';
import { TUTOR_PROMPT_VERSION } from './ai.js';
import { MemorySessionRepository } from '@fluentcoach/testing';

describe('explicit conversation help context', () => {
  it('retains the latest tutor source after it leaves the recent-turn window, and only uses fallback before any tutor turn', async () => {
    const reply = 'How can I help you today?';
    const contexts: TutorContext[] = [];
    const stream = async function* (context: TutorContext) {
      contexts.push(context);
      yield await Promise.resolve({ text: reply, done: true });
    };
    const service = new ConversationService(new MemorySessionRepository(), { stream });
    const session = await service.start('account', { scenarioSlug: 'hotel', level: 'A1', mode: 'natural' });
    await service.turn('account', session.id, 'first', 'No entiendo.');
    expect(contexts[0]!.helpLanguage).toBe('es');
    expect(contexts[0]!.recentTurns.some(turn => turn.speaker === 'tutor')).toBe(false);
    for (let i = 0; i < 41; i++) await service.help('account', session.id);
    const last = contexts.at(-1)!;
    expect(last.recentTurns).toHaveLength(40);
    expect(last.recentTurns[0]).toMatchObject({ sequence: 2, speaker: 'tutor', text: reply });
    expect(last.recentTurns.slice(1).every(turn => turn.speaker === 'help')).toBe(true);
    await service.turn('account', session.id, 'text-help', "I don't understand.");
    expect(contexts.at(-1)!.recentTurns[0]).toMatchObject({ sequence: 2, speaker: 'tutor', text: reply });
  });
  for (const level of ['A1', 'A2', 'B1', 'B2'] as const) {
    for (const mode of ['natural', 'teaching'] as const) {
      it(`${level}/${mode}: spoken/text help and button help receive the preceding tutor turn; normal turns stay English`, async () => {
        const reply = 'How can I help you today?';
        const stream = vi.fn(async function* (context: TutorContext) {
          expect(context.snapshot).toMatchObject({ level, mode });
          yield await Promise.resolve({ text: reply, done: true });
        });
        const service = new ConversationService(new MemorySessionRepository(), { stream });
        const session = await service.start('account', { scenarioSlug: 'hotel', level, mode });
        expect(session.snapshot.promptVersion).toBe(TUTOR_PROMPT_VERSION);
        await service.turn('account', session.id, 'first', 'Hello');
        expect(stream.mock.calls[0]![0]).not.toHaveProperty('helpLanguage');
        for (const [index, text] of ['No entiendo.', "I don't understand."].entries()) {
          await service.turn('account', session.id, `help-${index}`, text);
          const context = stream.mock.calls.at(-1)![0];
          expect(context.helpLanguage).toBe('es');
          expect(context.recentTurns.at(-2)).toMatchObject({ speaker: 'tutor', text: reply });
          expect(context.recentTurns.at(-1)).toMatchObject({ speaker: 'learner', text });
        }
        await service.help('account', session.id);
        expect(stream.mock.calls.at(-1)![0]).toMatchObject({ helpLanguage: 'es' });
        await service.turn('account', session.id, 'normal', 'Thank you');
        expect(stream.mock.calls.at(-1)![0]).not.toHaveProperty('helpLanguage');
      });
    }
  }
});
