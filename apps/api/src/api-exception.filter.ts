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
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
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
        'SESSION_NOT_FOUND',
        'SESSION_TERMINAL',
        'IDEMPOTENCY_CONFLICT',
        'UNSUPPORTED_AUDIO_TYPE',
        'AUDIO_TOO_LARGE',
        'AUDIO_DURATION_EXCEEDED',
      ].includes(error.message)
    ) {
      response
        .status(
          error.message === 'SESSION_NOT_FOUND'
            ? 404
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
    if (error instanceof HttpException) {
      const value = error.getResponse(),
        raw =
          typeof value === 'string'
            ? value
            : (value as { message?: string | string[] }).message;
      const message = Array.isArray(raw) ? raw[0] : raw;
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
