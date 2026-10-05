import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IssueService } from '@fluentcoach/application';
import {
  issueActionInput,
  issueKeyInput,
  issueQueryInput,
} from '@fluentcoach/contracts';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
@Controller('api/v1/issues')
@UseGuards(AuthGuard)
export class IssueController {
  constructor(@Inject(IssueService) private readonly issues: IssueService) {}
  @Get() list(@Req() request: AuthRequest, @Query() query: unknown) {
    issueQueryInput.parse(query);
    return this.issues.list(request.accountId!);
  }
  @Get(':key/evidence') evidence(
    @Req() request: AuthRequest,
    @Param('key') key: unknown,
    @Query() query: unknown,
  ) {
    issueQueryInput.parse(query);
    return this.issues.evidence(request.accountId!, issueKeyInput.parse(key));
  }
  @Post(':key/dismiss') @UseGuards(CsrfGuard) async dismiss(
    @Req() request: AuthRequest,
    @Param('key') key: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    issueQueryInput.parse(query);
    issueActionInput.parse(body ?? {});
    await this.issues.dismiss(request.accountId!, issueKeyInput.parse(key));
    return { dismissed: true };
  }
  @Post(':key/restore') @UseGuards(CsrfGuard) async restore(
    @Req() request: AuthRequest,
    @Param('key') key: unknown,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    issueQueryInput.parse(query);
    issueActionInput.parse(body ?? {});
    await this.issues.restore(request.accountId!, issueKeyInput.parse(key));
    return { dismissed: false };
  }
}
