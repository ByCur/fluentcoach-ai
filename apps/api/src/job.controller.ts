import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { verifyQStashSignature, JobService } from '@fluentcoach/application';
import { analysisJobInput } from '@fluentcoach/contracts';
import { JOB_SERVICE } from './tokens.js';
@Controller('api/v1/jobs')
export class JobController {
  constructor(@Inject(JOB_SERVICE) private readonly jobs: JobService) {}
  private async verify(
    signature: string | undefined,
    request: RawBodyRequest<Request>,
    path: string,
  ) {
    const current = process.env['QSTASH_CURRENT_SIGNING_KEY'],
      next = process.env['QSTASH_NEXT_SIGNING_KEY'];
    if (!current || !next)
      throw new ServiceUnavailableException('QSTASH_NOT_CONFIGURED');
    if (!signature || !request.rawBody)
      throw new UnauthorizedException('INVALID_QSTASH_SIGNATURE');
    try {
      await verifyQStashSignature({
        signature,
        currentSigningKey: current,
        nextSigningKey: next,
        body: request.rawBody,
        url: `${process.env['PUBLIC_ORIGIN']}${path}`,
      });
    } catch {
      throw new UnauthorizedException('INVALID_QSTASH_SIGNATURE');
    }
  }
  @Post('analysis') @HttpCode(204) async analysis(
    @Headers('upstash-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Body() job: unknown,
  ) {
    await this.verify(signature, request, '/api/v1/jobs/analysis');
    await this.jobs.execute(analysisJobInput.parse(job));
  }
  @Post('reconcile') @HttpCode(204) async reconcile(
    @Headers('upstash-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    await this.verify(signature, request, '/api/v1/jobs/reconcile');
    await this.jobs.reconcile();
  }
}
