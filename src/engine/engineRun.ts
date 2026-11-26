// One engine run's shared inputs: the validated inputs and the loan schedules built from
// them, passed together through the projection and KPI pass instead of the (portfolio,
// assumptions, schedules) triple.
import type { PropertySchedule } from "./schedule";
import type { ValidInputs } from "./validate";

/**
 * The validated inputs and each property's schedule, keyed by propertyId. `inputs` is
 * `assertInputs`' result as it is: compose it, never spread it (validate/entry.ts).
 */
export interface EngineRun {
  readonly inputs: ValidInputs;
  readonly schedules: Map<string, PropertySchedule>;
}
