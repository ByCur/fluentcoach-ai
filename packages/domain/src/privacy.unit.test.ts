import { expect, it } from "vitest";
import { retentionCutoff } from "./privacy.js";
it.each([
  "2027-01-01T00:00:00Z",
  "2026-03-29T01:00:00Z",
  "2026-10-25T01:00:00Z",
  "2028-03-01T00:00:00Z",
])(
  "90 days use UTC milliseconds across year/month/DST/leap boundaries: %s",
  (value) => {
    const now = new Date(value);
    expect(now.getTime() - retentionCutoff(now).getTime()).toBe(90 * 86400000);
  },
);
