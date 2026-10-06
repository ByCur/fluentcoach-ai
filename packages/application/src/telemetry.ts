// Closed vocabulary and numeric values only. Error objects, labels, content and identifiers never cross this port.
export const OPERATIONS = [
  "http",
  "conversation",
  "speech",
  "analysis",
  "export",
  "deletion",
  "retention",
  "redis",
  "plan",
] as const;
export type OperationalEvent = {
  operation: (typeof OPERATIONS)[number];
  outcome: "success" | "failure" | "cancelled";
  durationMs?: number;
  count?: number;
  status?: number;
};
export interface Telemetry {
  record(event: OperationalEvent): void;
}
export function operationalEvent(input: OperationalEvent): OperationalEvent {
  const result: OperationalEvent = {
    operation: OPERATIONS.includes(input.operation) ? input.operation : "http",
    outcome: ["success", "failure", "cancelled"].includes(input.outcome)
      ? input.outcome
      : "failure",
  };
  for (const key of ["durationMs", "count", "status"] as const)
    if (
      typeof input[key] === "number" &&
      Number.isFinite(input[key]) &&
      input[key] >= 0
    )
      result[key] = Math.min(input[key], 1e9);
  return result;
}
