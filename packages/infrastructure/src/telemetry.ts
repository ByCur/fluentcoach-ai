import {
  operationalEvent,
  type OperationalEvent,
  type Telemetry,
} from "@fluentcoach/application";
export class StructuredTelemetry implements Telemetry {
  constructor(
    private readonly write: (line: string) => void = (line) =>
      process.stdout.write(line + "\n"),
  ) {}
  record(event: OperationalEvent) {
    this.write(JSON.stringify(operationalEvent(event)));
  }
}
