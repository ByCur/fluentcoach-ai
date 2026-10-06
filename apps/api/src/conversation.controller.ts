import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ConversationService } from '@fluentcoach/application';
import { startSessionInput, turnInput, resourceId } from '@fluentcoach/contracts';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { CONVERSATION_SERVICE } from './tokens.js';
@Controller('api/v1')
@UseGuards(AuthGuard)
export class ConversationController {
  constructor(
    @Inject(CONVERSATION_SERVICE) private readonly service: ConversationService,
  ) {}
  @Get('scenarios') scenarios() {
    return this.service.scenarios();
  }
  @Get('sessions') history(@Req() r: AuthRequest) {
    return this.service.history(r.accountId!);
  }
  @Get('sessions/:id') session(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.service.get(r.accountId!, resourceId.parse(id));
  }
  @Post('sessions') @UseGuards(CsrfGuard) start(
    @Req() r: AuthRequest,
    @Body() raw: unknown,
  ) {
    return this.service.start(r.accountId!, startSessionInput.parse(raw));
  }
  @Post('sessions/:id/turns') @UseGuards(CsrfGuard) turn(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    const x = turnInput.parse(raw);
    return this.service.turn(r.accountId!, id, x.sourceEventKey, x.text, {
      kind: 'text',
      durationMs: x.activeDurationMs ?? 0,
    });
  }
  @Post('sessions/:id/help') @UseGuards(CsrfGuard) help(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.help(r.accountId!, id);
  }
  @Post('sessions/:id/end') @UseGuards(CsrfGuard) end(
    @Req() r: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.service.end(r.accountId!, id);
  }
  @Get('sessions/:id/events') async events(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Query('cursor') cursor = '0',
    @Res() res: Response,
  ) {
    const resume = r.headers['last-event-id'];
    let next = Number(typeof resume === 'string' ? resume : cursor);
    if (!Number.isSafeInteger(next) || next < 0)
      throw new BadRequestException('INVALID_STREAM_CURSOR');
    // Authorize before committing SSE headers so guessed IDs receive a normal 404.
    let events;
    try {
      events = await this.service.events(r.accountId!, id, next);
    } catch {
      throw new NotFoundException('SESSION_NOT_FOUND');
    }
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();
    for (let poll = 0; poll < 300 && !res.destroyed; poll++) {
      for (const e of events) {
        res.write(`id: ${e.sequence}\ndata: ${JSON.stringify(e)}\n\n`);
        next = e.sequence;
      }
      if (poll % 50 === 0) res.write(': keepalive\n\n');
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (res.destroyed) break;
      try {
        events = await this.service.events(r.accountId!, id, next);
      } catch {
        break;
      }
    }
    res.end();
  }
}
