import {
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
import { startSessionInput, turnInput } from '@fluentcoach/contracts';
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
    return this.service.turn(r.accountId!, id, x.sourceEventKey, x.text);
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
    let next = Number(cursor);
    if (!Number.isSafeInteger(next) || next < 0) throw Error('INVALID_CURSOR');
    await this.service.events(r.accountId!, id, next);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.flushHeaders();
    for (let poll = 0; poll < 100 && !res.destroyed; poll++) {
      const events = await this.service.events(r.accountId!, id, next);
      for (const e of events) {
        res.write(`id: ${e.sequence}\ndata: ${JSON.stringify(e)}\n\n`);
        next = e.sequence;
      }
      if (
        events.some(
          (e) => e.kind === 'turn.completed' || e.kind === 'provider.failed',
        )
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    res.end();
  }
}
