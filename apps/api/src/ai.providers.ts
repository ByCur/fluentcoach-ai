import { StructuredTelemetry } from '@fluentcoach/infrastructure';
import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  AiError,
  JobService,
  ReportService,
  type ConversationProvider,
  type SessionAnalyzer,
} from '@fluentcoach/application';
import {
  GeminiTextAdapter,
  loadAiConfig,
  OllamaTextAdapter,
  PostgresAiBudget,
  PostgresJobStore,
  PostgresReportRepository,
  QStashTransport,
} from '@fluentcoach/infrastructure';
import {
  FakeConversationProvider,
  FakeSessionAnalyzer,
} from '@fluentcoach/testing';
import { JOB_SERVICE } from './tokens.js';
export function aiAdapters(): {
  conversation: ConversationProvider;
  analyzer: SessionAnalyzer;
} {
  const config = loadAiConfig(process.env);
  if (config.provider === 'fake')
    return {
      conversation: new FakeConversationProvider(
        process.env['NODE_ENV'] === 'test' ? 600 : 50,
      ),
      analyzer: new FakeSessionAnalyzer(),
    };
  if (config.provider === 'disabled')
    return {
      conversation: {
        assertAvailable: () => Promise.reject(new AiError('unavailable')),
        stream: () => {
          throw new AiError('unavailable');
        },
      },
      analyzer: {
        analyzeTranscript: () => Promise.reject(new AiError('unavailable')),
      },
    };
  if (config.provider === 'ollama') {
    const ollama = new OllamaTextAdapter(config.ollama);
    return { conversation: ollama, analyzer: ollama };
  }
  const gemini = new GeminiTextAdapter(
    config.gemini,
    new PostgresAiBudget(config.gemini.quota, config.gemini.model),
  );
  return {
    conversation: {
      assertAvailable: () =>
        process.env['NODE_ENV'] === 'production'
          ? Promise.reject(new AiError('unauthorized'))
          : gemini.assertAvailable(),
      stream: (context, input, options) =>
        gemini.stream(
          { ...context, synthetic: process.env['NODE_ENV'] !== 'production' },
          input,
          options,
        ),
    },
    analyzer: gemini,
  };
}
export function createJobs(reports: ReportService) {
  const transport =
    process.env['NODE_ENV'] !== 'production' && !process.env['QSTASH_TOKEN']
      ? {
          enqueue: (job: Parameters<JobService['execute']>[0]) => {
            queueMicrotask(() => {
              void jobs.execute(job).catch(() => undefined);
            });
            return Promise.resolve();
          },
        }
      : process.env['QSTASH_TOKEN']
        ? new QStashTransport({
            token: process.env['QSTASH_TOKEN'],
            destination: `${process.env['PUBLIC_API_ORIGIN'] ?? process.env['PUBLIC_ORIGIN']}/api/v1/jobs/analysis`,
          })
        : { enqueue: () => Promise.reject(new Error('QSTASH_UNAVAILABLE')) };
  const jobs = new JobService(new PostgresJobStore(), transport, reports,3,new StructuredTelemetry());
  return jobs;
}
@Injectable()
export class JobReconciler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  constructor(@Inject(JOB_SERVICE) private readonly jobs: JobService) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.jobs
        .reconcile()
        .catch(() => undefined)
        .finally(() => {
          this.running = false;
        });
    }, 1000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
export const createReports = (analyzer: SessionAnalyzer) => {
  const config = loadAiConfig(process.env);
  return new ReportService(
    new PostgresReportRepository(process.env['NODE_ENV'] !== 'production'),
    analyzer,
    config.provider === 'ollama' ? config.ollama.analysisTimeoutMs : 25_000,
  );
};
