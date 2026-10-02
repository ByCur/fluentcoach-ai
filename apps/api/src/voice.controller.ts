import {
  BadRequestException,
  Controller,
  Inject,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  VOICE_MAX_BYTES,
  VOICE_MIME_TYPES,
  type VoiceTurnService,
} from '@fluentcoach/application';
import type { Express } from 'express';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { VOICE_TURN_SERVICE } from './tokens.js';

@Controller('api/v1')
@UseGuards(AuthGuard)
export class VoiceController {
  constructor(
    @Inject(VOICE_TURN_SERVICE) private readonly service: VoiceTurnService,
  ) {}

  @Post('sessions/:id/voice-turns')
  @UseGuards(CsrfGuard)
  @UseInterceptors(FileInterceptor('audio', {
    limits: { fileSize: VOICE_MAX_BYTES, files: 1, fields: 2 },
    fileFilter: (_request, file, callback) =>
      callback(
        VOICE_MIME_TYPES.includes(file.mimetype as typeof VOICE_MIME_TYPES[number])
          ? null
          : new BadRequestException('UNSUPPORTED_AUDIO_TYPE'),
        VOICE_MIME_TYPES.includes(file.mimetype as typeof VOICE_MIME_TYPES[number]),
      ),
  }))
  turn(
    @Req() request: AuthRequest,
    @Param('id') sessionId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('AUDIO_REQUIRED');
    const sourceEventKey = String(request.body?.sourceEventKey ?? '');
    const durationMs = Number(request.body?.durationMs);
    if (!sourceEventKey || sourceEventKey.length > 100)
      throw new BadRequestException('INVALID_SOURCE_EVENT_KEY');
    return this.service.turn({
      accountId: request.accountId!,
      sessionId,
      sourceEventKey,
      audio: file.buffer,
      mimeType: file.mimetype,
      filename: file.originalname,
      durationMs,
    });
  }
}
