import { Controller, Get, HttpCode, Inject, Optional, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthResponse } from '@fluentcoach/contracts';
import { dependenciesReady, probeTcpUrl, schemaReady, releaseIdentitySchema, RELEASE_MIGRATION, type DependencyProbe } from '@fluentcoach/infrastructure';

export const READINESS_PROBES = Symbol('READINESS_PROBES');

@Controller('health')
export class HealthController {
  private readonly probes: readonly DependencyProbe[];

  constructor(@Optional() @Inject(READINESS_PROBES) probes?: readonly DependencyProbe[]) {
    this.probes = probes ?? [
      async () => await probeTcpUrl(process.env['DATABASE_URL'] ?? ''),
      async () => await probeTcpUrl(process.env['REDIS_URL'] ?? ''),
      schemaReady
    ];
  }

  @Get('live')
  live(): HealthResponse { return { status: 'ok', service: 'api' }; }

  @Get('release')
  release(@Res({passthrough:true}) response:Response) {
    const identity = releaseIdentitySchema.safeParse({
      commitSha:process.env['RELEASE_COMMIT_SHA'], imageDigest:process.env['RELEASE_IMAGE_DIGEST'],
      migrationVersion:process.env['RELEASE_MIGRATION_VERSION'],
      compatibleMigrationVersions:['202610060001_m10_privacy',RELEASE_MIGRATION],
    });
    if (!identity.success) {response.status(503);return {status:'unreleased'};}
    return identity.data;
  }

  @Get('ready')
  @HttpCode(200)
  async ready(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const ready = await dependenciesReady(this.probes);
    if (!ready) response.status(503);
    return { status: ready ? 'ok' : 'not-ready', service: 'api' };
  }
}
