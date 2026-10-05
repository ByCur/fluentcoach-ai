import {
  DeterministicPlanGenerator,
  type PlanCandidate,
  type PlanGenerator,
} from '@fluentcoach/application';
/** CI double uses the same documented selection policy, with no model execution. */
export class FakePlanGenerator implements PlanGenerator {
  select(candidates: readonly PlanCandidate[]) {
    return new DeterministicPlanGenerator().select(candidates);
  }
}
