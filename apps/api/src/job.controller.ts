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
import { PrivacyService } from '@fluentcoach/application';
import { z } from 'zod';
import { analysisJobInput } from '@fluentcoach/contracts';
import { JOB_SERVICE } from './tokens.js';
@Controller('api/v1/jobs')
export class JobController {
  constructor(@Inject(JOB_SERVICE) private readonly jobs: JobService, @Inject(PrivacyService) private readonly privacy?: PrivacyService) {}
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
  @Post('privacy') @HttpCode(204) async privacyJob(@Headers('upstash-signature') signature:string|undefined,@Req() request:RawBodyRequest<Request>,@Body() raw:unknown){await this.verify(signature,request,'/api/v1/jobs/privacy');await this.privacy!.execute(z.object({version:z.literal('privacy-job-v1'),id:z.uuid()}).strict().parse(raw).id);}
  @Post('retention') @HttpCode(204) async retention(@Headers('upstash-signature') signature:string|undefined,@Req() request:RawBodyRequest<Request>,@Body() raw:unknown){await this.verify(signature,request,'/api/v1/jobs/retention');z.object({version:z.literal('retention-v1')}).strict().parse(raw);await this.privacy!.retain();}
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
