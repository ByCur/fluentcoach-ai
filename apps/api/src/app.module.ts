import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { IdentityController } from './identity.controller.js'; import { LearnerController } from './learner.controller.js'; import { AuthGuard } from './auth.guard.js'; import { CsrfGuard } from './csrf.guard.js'; import { RedisSessionStore,SESSION_STORE } from './session.js';

@Module({ controllers: [HealthController,IdentityController,LearnerController],providers:[AuthGuard,CsrfGuard,{provide:SESSION_STORE,useFactory:()=>new RedisSessionStore(process.env['REDIS_URL']!)}] })
export class AppModule {}
