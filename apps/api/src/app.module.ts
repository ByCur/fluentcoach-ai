import {
  aiAdapters,
  createJobs,
  createReports,
  JobReconciler,
} from './ai.providers.js';
import { ReportController } from './report.controller.js';
import { Module } from '@nestjs/common';
import {
  ConversationService,
  LearnerService,
  ReportService,
} from '@fluentcoach/application';
import {
  Auth0OidcAdapter,
  PostgresAccountRepository,
  PostgresJobStore,
  PostgresLearnerRepository,
  PostgresSessionRepository,
} from '@fluentcoach/infrastructure';
import { FakeOidcProvider } from '@fluentcoach/testing';
import { HealthController } from './health.controller.js';
import { IdentityController, OIDC_PROVIDER } from './identity.controller.js';
import { JobController } from './job.controller.js';
import { ConversationController } from './conversation.controller.js';
import { LearnerController } from './learner.controller.js';
import { AuthGuard } from './auth.guard.js';
import { CsrfGuard } from './csrf.guard.js';
import { OriginGuard } from './origin.guard.js';
import { RedisSessionStore, SESSION_STORE } from './session.js';
import {
  ACCOUNT_REPOSITORY,
  CONVERSATION_SERVICE,
  JOB_SERVICE,
  LEARNER_SERVICE,
  REPORT_SERVICE,
  AI_ADAPTERS,
} from './tokens.js';
@Module({
  controllers: [
    HealthController,
    IdentityController,
    LearnerController,
    ConversationController,
    JobController,
    ReportController,
  ],
  providers: [
    AuthGuard,
    CsrfGuard,
    OriginGuard,
    {
      provide: SESSION_STORE,
      useFactory: () => new RedisSessionStore(process.env['REDIS_URL']!),
    },
    { provide: ACCOUNT_REPOSITORY, useClass: PostgresAccountRepository },
    { provide: AI_ADAPTERS, useFactory: aiAdapters },
    {
      provide: REPORT_SERVICE,
      inject: [AI_ADAPTERS],
      useFactory: (adapters: ReturnType<typeof aiAdapters>) =>
        createReports(adapters.analyzer),
    },
    {
      provide: JOB_SERVICE,
      inject: [REPORT_SERVICE],
      useFactory: (reports: ReportService) => createJobs(reports),
    },
    JobReconciler,
    {
      provide: CONVERSATION_SERVICE,
      inject: [AI_ADAPTERS],
      useFactory: (adapters: ReturnType<typeof aiAdapters>) =>
        new ConversationService(
          new PostgresSessionRepository(),
          adapters.conversation,
          new PostgresJobStore(),
        ),
    },
    {
      provide: LEARNER_SERVICE,
      useFactory: () => new LearnerService(new PostgresLearnerRepository()),
    },
    {
      provide: OIDC_PROVIDER,
      useFactory: () =>
        process.env['NODE_ENV'] === 'production'
          ? new Auth0OidcAdapter({
              issuer: process.env['OIDC_ISSUER']!,
              clientId: process.env['OIDC_CLIENT_ID']!,
              clientSecret: process.env['OIDC_CLIENT_SECRET']!,
              audience: process.env['OIDC_AUDIENCE']!,
              callbackUrl: process.env['OIDC_CALLBACK_URL']!,
              redisUrl: process.env['REDIS_URL']!,
            })
          : new FakeOidcProvider(),
    },
  ],
})
export class AppModule {}
