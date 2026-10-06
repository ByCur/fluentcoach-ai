import { PrivacyController } from './privacy.controller.js';
import { PrivacyReconciler } from './privacy-reconciler.js';
import { PrivacyService } from '@fluentcoach/application';
import { PostgresPrivacyRepository, StructuredTelemetry } from '@fluentcoach/infrastructure';
import { PlanProgressController } from './plan-progress.controller.js';
import { IssueController } from './issue.controller.js';
import { VocabularyController } from './vocabulary.controller.js';
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
  IssueService,
  ReportService,
  VoiceTurnService,
  VocabularyService,
  PlanService,
  ProgressService,
} from '@fluentcoach/application';
import {
  OllamaTextAdapter,
  loadAiConfig,
  Auth0OidcAdapter,
  PostgresAccountRepository,
  PostgresJobStore,
  PostgresLearnerRepository,
  PostgresIssueRepository,
  PostgresSessionRepository,
  PostgresVocabularyRepository,
  PostgresPlanRepository,
  PostgresProgressRepository,
} from '@fluentcoach/infrastructure';
import { FakeOidcProvider, FakePlanGenerator } from '@fluentcoach/testing';
import { HealthController } from './health.controller.js';
import { IdentityController, OIDC_PROVIDER } from './identity.controller.js';
import { JobController } from './job.controller.js';
import { ConversationController } from './conversation.controller.js';
import { VoiceController } from './voice.controller.js';
import { speechTranscriber } from './speech.providers.js';
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
  VOICE_TURN_SERVICE,
  SPEECH_TRANSCRIBER,
} from './tokens.js';
@Module({
  controllers: [
    PrivacyController,
    HealthController,
    IdentityController,
    LearnerController,
    ConversationController,
    VoiceController,
    JobController,
    ReportController,
    IssueController,
    VocabularyController,
    PlanProgressController,
  ],
  providers: [
    {provide:PrivacyService,useFactory:()=>new PrivacyService(new PostgresPrivacyRepository(Number(process.env['PRIVACY_EXPORT_MAX_BYTES']??8388608)))},
    PrivacyReconciler,
    { provide: PlanService, useFactory: () => {
      const config = loadAiConfig(process.env);
      return new PlanService(new PostgresPlanRepository(config.provider === 'fake' ? new FakePlanGenerator() : config.provider === 'ollama' ? new OllamaTextAdapter(config.ollama) : undefined));
    } },
    { provide: ProgressService, useFactory: () => new ProgressService(new PostgresProgressRepository()) },
    {
      provide: IssueService,
      useFactory: () => new IssueService(new PostgresIssueRepository()),
    },
    { provide: VocabularyService, useFactory: () => new VocabularyService(new PostgresVocabularyRepository()) },
    AuthGuard,
    CsrfGuard,
    OriginGuard,
    {
      provide: SESSION_STORE,
      useFactory: () => new RedisSessionStore(process.env['REDIS_URL']!),
    },
    { provide: ACCOUNT_REPOSITORY, useClass: PostgresAccountRepository },
    { provide: AI_ADAPTERS, useFactory: aiAdapters },
    { provide: SPEECH_TRANSCRIBER, useFactory: speechTranscriber },
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
      provide: VOICE_TURN_SERVICE,
      inject: [CONVERSATION_SERVICE, SPEECH_TRANSCRIBER],
      useFactory: (
        conversations: ConversationService,
        transcriber: ReturnType<typeof speechTranscriber>,
      ) => new VoiceTurnService(conversations, transcriber,new StructuredTelemetry()),
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
