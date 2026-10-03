// The engine's input rules as the restore check (P5b). Lives outside src/data because
// the data layer never calls engine functions (DB → mappers → engine).
import { validateInputs, validatePortfolio } from "../engine";
import type { InputRules } from "../data/backup";

/** Every engine input rule over a restored portfolio; without assumptions, the
 *  portfolio rules only. */
export const checkInputRules: InputRules = (portfolio, assumptions) =>
  assumptions
    ? validateInputs(portfolio, assumptions)
    : validatePortfolio(portfolio);
