import { StructuredTelemetry } from '@fluentcoach/infrastructure';
import { AiError, TerminalSessionError } from '@fluentcoach/application';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError } from 'zod';
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly telemetry=new StructuredTelemetry()){}
  catch(error: unknown, host: ArgumentsHost) {
    this.telemetry.record({operation:'http',outcome:'failure'});
    const response = host.switchToHttp().getResponse<Response>();
    if(error instanceof Error && 'type' in error && ['entity.too.large','entity.parse.failed'].includes(String(error.type))){const large=error.type==='entity.too.large';response.status(large?413:400).json({error:{code:large?'BODY_TOO_LARGE':'INVALID_JSON',message:'Los datos enviados no son válidos.'}});return;}
    if (
      error instanceof Error &&
      'code' in error &&
      (error as Error & { code?: string }).code === 'LIMIT_FILE_SIZE'
    ) {
      response.status(413).json({
        error: { code: 'AUDIO_TOO_LARGE', message: 'AUDIO_TOO_LARGE' },
      });
      return;
    }
    if (error instanceof TerminalSessionError) {
      response.status(409).json({
        error: { code: 'SESSION_TERMINAL', message: 'SESSION_TERMINAL' },
      });
      return;
    }
    if (error instanceof AiError) {
      response
        .status(error.code === 'unauthorized' ? 403 : 503)
        .json({
          error: {
            code: error.code,
            message:
              'El proveedor no está disponible. Tu sesión se conserva; puedes volver a intentarlo.',
          },
        });
      return;
    }
    if (
      error instanceof Error &&
      [
        'EXPORT_NOT_FOUND', 'EXPORT_TOO_LARGE', 'PRIVACY_JOB_CONFLICT', 'ACCOUNT_DELETING', 'OPEN_SESSION_LIMIT',
        'PLAN_NOT_FOUND',
        'STALE_PLAN_VERSION',
        'PLAN_SOURCES_CHANGED',
        'ACTIVITY_STATE_CONFLICT',
        'PLAN_GENERATION_RETRYABLE',
        'SESSION_NOT_FOUND',
        'ISSUE_NOT_FOUND',
        'VOCABULARY_NOT_FOUND',
        'STALE_CARD_VERSION',
        'SESSION_TERMINAL',
        'IDEMPOTENCY_CONFLICT',
        'UNSUPPORTED_AUDIO_TYPE',
        'AUDIO_TOO_LARGE',
        'AUDIO_DURATION_EXCEEDED',
      ].includes(error.message)
    ) {
      response
        .status(
          ['EXPORT_NOT_FOUND', 'PLAN_NOT_FOUND', 'SESSION_NOT_FOUND', 'ISSUE_NOT_FOUND', 'VOCABULARY_NOT_FOUND'].includes(error.message)
            ? 404
            : error.message === 'PLAN_GENERATION_RETRYABLE' ? 503
            : error.message.startsWith('AUDIO_') || error.message === 'UNSUPPORTED_AUDIO_TYPE'
              ? 400
              : 409,
        )
        .json({ error: { code: error.message, message: error.message } });
      return;
    }
    if (error instanceof ZodError) {
      response
        .status(400)
        .json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos enviados no son válidos.',
          },
        });
      return;
    }
    if (
      error instanceof Error &&
      [
        'TEXT_TOO_LONG',
        'PROFILE_REQUIRED',
        'INVALID_ACTIVE_DURATION',
        'INVALID_CURSOR',
        'SESSION_NOT_ACTIVE',
        'INVALID_CEFR_LEVEL',
        'INVALID_LANGUAGE',
        'INVALID_TIMEZONE',
        'INVALID_INTERESTS',
        'INVALID_PRACTICE_MINUTES',
        'INVALID_PRACTICE_DAYS',
        'INVALID_CONSENT_VERSION',
      ].includes(error.message)
    ) {
      response
        .status(400)
        .json({
          error: {
            code: error.message,
            message: 'Los datos enviados no son válidos.',
          },
        });
      return;
    }
    if (error instanceof Error && ['ACCOUNT_DELETING','OPEN_SESSION_LIMIT'].includes(error.message)) {response.status(409).json({error:{code:error.message,message:error.message}});return;}
    if (error instanceof Error && 'code' in error && (error as Error & {code:string}).code==='55000') { const code=error.message==='OPEN_SESSION_LIMIT'?'OPEN_SESSION_LIMIT':'ACCOUNT_DELETING';response.status(409).json({error:{code,message:code}});return;}
    if (error instanceof HttpException) {
      const value = error.getResponse(),
        raw =
          typeof value === 'string'
            ? value
            : (value as { message?: string | string[] }).message;
      const candidate = Array.isArray(raw) ? raw[0] : raw;
      const message=typeof candidate==='string' && ['AUTH_REQUIRED','SESSION_EXPIRED','ACCOUNT_REVOKED','INVALID_ORIGIN','CSRF_REJECTED','AUDIO_REQUIRED','INVALID_SOURCE_EVENT_KEY','STALE_VERSION','QSTASH_NOT_CONFIGURED','INVALID_QSTASH_SIGNATURE','SYNTHETIC_AUTH_DISABLED','INVALID_STREAM_CURSOR','SESSION_NOT_FOUND'].includes(candidate)?candidate:'REQUEST_FAILED';
      response
        .status(error.getStatus())
        .json({
          error: {
            code: message ?? 'REQUEST_FAILED',
            message: message ?? 'Request failed',
          },
        });
      return;
    }
    response
      .status(500)
      .json({
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
      });
  }
}
