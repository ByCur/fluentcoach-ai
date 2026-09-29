import { Body,ConflictException,Controller,Get,Inject,Post,Put,Req,UseGuards } from '@nestjs/common';
import type { LearnerService } from '@fluentcoach/application';
import { consentInput,learnerProfileInput,onboardingInput,practiceGoalInput } from '@fluentcoach/contracts';
import { AuthGuard,type AuthRequest } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { LEARNER_SERVICE } from './tokens.js';
@Controller('api/v1') @UseGuards(AuthGuard)
export class LearnerController {
 constructor(@Inject(LEARNER_SERVICE) private readonly learners:LearnerService){}
 @Get('learner-profile') profile(@Req()r:AuthRequest){return this.learners.profile(r.accountId!)}
 @Put('learner-profile') @UseGuards(CsrfGuard) async putProfile(@Req()r:AuthRequest,@Body()raw:unknown){try{return await this.learners.saveProfile(r.accountId!,learnerProfileInput.parse(raw));}catch(e){if(e instanceof Error&&e.message==='STALE_VERSION')throw new ConflictException('STALE_VERSION');throw e;}}
 @Get('practice-goal') goal(@Req()r:AuthRequest){return this.learners.goal(r.accountId!)}
 @Put('practice-goal') @UseGuards(CsrfGuard) putGoal(@Req()r:AuthRequest,@Body()raw:unknown){return this.learners.saveGoal(r.accountId!,practiceGoalInput.parse(raw))}
 @Get('consent') consent(@Req()r:AuthRequest){return this.learners.consent(r.accountId!)}
 @Post('consent') @UseGuards(CsrfGuard) addConsent(@Req()r:AuthRequest,@Body()raw:unknown){return this.learners.addConsent(r.accountId!,consentInput.parse(raw))}
 @Post('onboarding/complete') @UseGuards(CsrfGuard) complete(@Req()r:AuthRequest,@Body()raw:unknown){return this.learners.complete(r.accountId!,onboardingInput.parse(raw))}
}
