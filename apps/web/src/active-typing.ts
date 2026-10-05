/** Bounded browser progress telemetry, never security or billing accounting. */
export class ActiveTypingTimer {
  private total = 0;
  private last: number | null = null;
  input(now: number) {
    // Count only intervals between edits; an idle gap contributes no time.
    if (this.last !== null && now >= this.last && now - this.last <= 30000)
      this.total = Math.min(300000, this.total + now - this.last);
    this.last = now;
  }
  pause() {
    this.last = null;
  }
  duration() {
    return Math.floor(this.total);
  }
  reset() {
    this.total = 0;
    this.last = null;
  }
}
