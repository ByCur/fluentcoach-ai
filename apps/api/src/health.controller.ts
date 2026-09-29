import { Controller, Get, HttpCode, Inject, Optional, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse } from '@fluentcoach/contracts';
import { dependenciesReady, probeTcpUrl, type DependencyProbe } from '@fluentcoach/infrastructure';

export const READINESS_PROBES = Symbol('READINESS_PROBES');

@Controller('health')
export class HealthController {
  private readonly probes: readonly DependencyProbe[];

  constructor(@Optional() @Inject(READINESS_PROBES) probes?: readonly DependencyProbe[]) {
    this.probes = probes ?? [
      async () => await probeTcpUrl(process.env['DATABASE_URL'] ?? ''),
      async () => await probeTcpUrl(process.env['REDIS_URL'] ?? '')
    ];
  }

  @Get('live')
  live(): HealthResponse { return { status: 'ok', service: 'api' }; }

  @Get('ready')
  @HttpCode(200)
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const ready = await dependenciesReady(this.probes);
    if (!ready) response.status(503);
    return { status: ready ? 'ok' : 'not-ready', service: 'api' };
  }
}
