import { expect, it } from 'vitest';
import { ActiveTypingTimer } from './active-typing.js';
it('excludes idle over 30 seconds, blur/hidden and tutor waiting; resets after successful send', () => {
  const timer = new ActiveTypingTimer();
  timer.input(0);
  timer.input(1000);
  timer.input(31001);
  timer.input(32001);
  expect(timer.duration()).toBe(2000);
  timer.pause();
  timer.input(90000);
  timer.input(91000);
  expect(timer.duration()).toBe(3000);
  timer.pause();
  expect(timer.duration()).toBe(3000);
  timer.reset();
  expect(timer.duration()).toBe(0);
});
it('clamps accumulated typing to five minutes', () => {
  const t = new ActiveTypingTimer();
  for (let n = 0; n < 100; n++) t.input(n * 30000);
  expect(t.duration()).toBe(300000);
});
