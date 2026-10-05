import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PlanService, ProgressService } from '@fluentcoach/application';
import {
  planGenerateInput,
  planVersionInput,
  planRefreshInput,
  resourceId,
} from '@fluentcoach/contracts';
import { AuthGuard, type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
@Controller('api/v1')
@UseGuards(AuthGuard)
export class PlanProgressController {
  constructor(
    @Inject(PlanService) private readonly plans: PlanService,
    @Inject(ProgressService) private readonly progress: ProgressService,
  ) {}
  @Get('plans/current') current(@Req() r: AuthRequest) {
    return this.plans.current(r.accountId!);
  }
  @Post('plans/generate') @UseGuards(CsrfGuard) generate(
    @Req() r: AuthRequest,
    @Body() raw: unknown,
  ) {
    return this.plans.generate(r.accountId!, planGenerateInput.parse(raw));
  }
  @Post('plans/:id/refresh') @UseGuards(CsrfGuard) refresh(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.plans.generate(r.accountId!, {
      ...planRefreshInput.parse(raw),
      planId: resourceId.parse(id),
    });
  }
  @Post('plans/:id/accept') @UseGuards(CsrfGuard) accept(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() raw: unknown,
  ) {
    return this.plans.accept(
      r.accountId!,
      resourceId.parse(id),
      planVersionInput.parse(raw).expectedVersion,
    );
  }
  @Post('plans/:id/activities/:activityId/skip') @UseGuards(CsrfGuard) skip(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() raw: unknown,
  ) {
    return this.plans.skip(
      r.accountId!,
      resourceId.parse(id),
      resourceId.parse(activityId),
      planVersionInput.parse(raw).expectedVersion,
    );
  }
  @Post('plans/:id/activities/:activityId/start') @UseGuards(CsrfGuard) start(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Param('activityId') activityId: string,
    @Body() raw: unknown,
  ) {
    return this.plans.start(
      r.accountId!,
      resourceId.parse(id),
      resourceId.parse(activityId),
      planVersionInput.parse(raw).expectedVersion,
    );
  }
  @Get('progress') metrics(@Req() r: AuthRequest) {
    return this.progress.get(r.accountId!);
  }
  @Get('progress/issues') issues(@Req() r: AuthRequest) {
    return this.progress.issues(r.accountId!);
  }
}
