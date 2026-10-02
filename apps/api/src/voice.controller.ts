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
    @UploadedFile() file?: UploadedAudioFile,
  ) {
    if (!file) throw new BadRequestException('AUDIO_REQUIRED');
    const body: unknown = request.body;
    const fields = isMultipartFields(body) ? body : {};
    const sourceEventKey =
      typeof fields.sourceEventKey === 'string' ? fields.sourceEventKey : '';
    const durationMs =
      typeof fields.durationMs === 'string' ? Number(fields.durationMs) : NaN;
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

interface UploadedAudioFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

function isMultipartFields(
  value: unknown,
): value is { sourceEventKey?: unknown; durationMs?: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
