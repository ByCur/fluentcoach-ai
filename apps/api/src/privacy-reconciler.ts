import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { PrivacyService } from "@fluentcoach/application";
@Injectable()
export class PrivacyReconciler implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;
  private nextRetention = 0;
  constructor(
    @Inject(PrivacyService) private readonly privacy: PrivacyService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      void this.privacy
        .reconcile()
        .then(async () => {
          if (Date.now() >= this.nextRetention) {
            await this.privacy.retain();
            this.nextRetention = Date.now() + 3600000;
          }
        })
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
