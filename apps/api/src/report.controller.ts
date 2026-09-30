import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReportService } from '@fluentcoach/application';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { REPORT_SERVICE } from './tokens.js';
@Controller('api/v1/sessions')
@UseGuards(AuthGuard)
export class ReportController {
  constructor(
    @Inject(REPORT_SERVICE) private readonly reports: ReportService,
  ) {}
  @Get(':id/report') view(
    @Req() request: AuthRequest,
    @Param('id') id: string,
  ) {
    return this.reports.view(request.accountId!, id);
  }
  @Post(':id/report/retry') @UseGuards(CsrfGuard) async retry(
    @Req() request: AuthRequest,
    @Param('id') id: string,
  ) {
    await this.reports.retry(request.accountId!, id);
    return this.reports.view(request.accountId!, id);
  }
}
