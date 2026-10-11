# 0174. Golden master covers loan events; three named regression layers

- Status: Accepted
- Date: 2026-10-11
- Source: issue #160 (code review 2026-10); owner decision (2026-10-11, Track 14: #160 option A
  plus option C with an engine-free KPI model); Track 14 PR E2
- Amends: [0039](0039-golden-master.md) (the golden master gains cases that hash every field;
  the exclusion list is frozen), [0081](0081-public-release.md) (decision 2:
  the baseline is three named layers, and the docs say which of them checks correctness)
- Related: [0001](0001-behaviour-change-gate.md) (behaviour-change gate),
  [0109](0109-loan-prepayments-and-recasts.md) (prepayments, recasts and event outcomes)
- Amended by: [0177](0177-remove-unused-engine-output-fields.md) (decisions 1 and 3: an unread
  field may be removed and v1 re-recorded, under a stripped-snapshot proof)

## Context

The regression baseline of ADR 0081 has three parts, and the docs describe them as if they
all proved the engine correct. They do not:

1. **The golden master misses the loan events.** `golden.test.ts` hashes full-precision output
   but leaves out every field added after it was recorded (`ADDED_FIELDS`), so no hash covers
   `prepaid`, `prepaymentFee(s)`, `eventOutcomes`, `refinanced` or `cashToOwner`. None of its
   fixtures has a prepayment or a recast either. A refactor of the event code can move those
   numbers with every hash green.
2. **The money parity targets are engine values.** Since ADR 0081 (scaled seed) every money
   target is the engine's own output for the fictional seed, not an outside figure. They pin
   the engine; they do not check it. Only the mortgage maths has an independent check (the
   reference model in `src/engine/__tests__/reference/`), and nothing enforces that model's
   own rule that it imports nothing from the engine.
3. **The docs overclaim.** `docs/model-limitations.md`, `engine-parity.md`, `CONTRIBUTING.md`,
   `SPEC.md` and `README.md` call the targets "verified" or the baseline an independent check.

## Decision

1. **v1 golden cases are frozen.** The existing cases keep today's exclusion list and stay
   byte-for-byte identical. The list is not extended any more.
2. **v2 golden cases hash every field, per field.** New cases (loan events with a refinance;
   a cash-outside prepayment on a future buy; each with base and shocked assumptions) hash the
   whole output with no exclusions. Each section is snapshotted as one hash per field path
   (for an array of records, the field across all rows). They cover schedules and event
   outcomes, snapshots, property and portfolio projections, KPIs, CPI, the real lens,
   year snapshots and financing exposure; the one-pass `portfolioOutputs` is compared with
   those parts.
3. **Adding a field is not a behaviour change; changing one is.** A new engine output field
   shows in the v2 snapshot as added lines only. It is recorded in the same commit as the
   field, under the field's own ADR. A changed existing line means a number moved: it needs
   an approved behaviour change (ADR 0001), as before.
4. **Three named layers.** The docs name them and say what each proves:
   - **Independent references** — engine-free models written from `SPEC.md`: the mortgage
     model and, new, a KPI model (rent, holding costs, NOI, debt service, net cash flow,
     equity, cash to owner, levered IRR, CAGR and multiples). Where they agree with the
     engine, two implementations written apart give the same number, so an error has to
     be made twice to pass. ESLint and dependency-cruiser allow them no import but each
     other (no engine, `src/lib`, support or adapter code).
   - **Parity targets** — the numbers the engine must reproduce. Money targets are engine
     values since ADR 0081; ratio, rate and year targets did not move. For a change, a
     mismatch is still an engine bug (CLAUDE.md §6).
   - **Characterisation snapshot** — the golden master. It detects any change; it proves
     nothing correct.
5. **Scope of the KPI model.** It covers the sample portfolio (checked against the parity
   targets and the engine) and one event case (a prepayment and a recast, checked against the
   engine), plus the lease edges of SPEC §4.5 and a portfolio without loans. It throws on any
   input outside that scope, so it never silently ignores one: it checks its own inputs
   (future purchases, valuations, overlapping leases, more than one loan per property,
   development loans, events on or before baseDate), and the test adapter flags the engine
   fields it has no input for (inactive properties, growth overrides, funding records,
   shocks, acquisition costs).
6. **"Additions only" is checked in review.** No tool fails a snapshot update that changes
   an existing line; the reviewer of a `vitest -u` diff checks it.

## Consequences

- A refactor that moves an event, refinance or cash-to-owner number now fails the golden
  master.
- A new output field costs one reviewed snapshot update of added lines; an edit to an
  existing line in the same commit is a red flag in review.
- Known limit: the KPI model reuses the mortgage reference for the loan rows, so a loan-maths
  error shared by both references is not caught there (the mortgage reference is itself
  cross-checked against the engine and the seed loans).
- No engine source, computed number, parity target, stored data, export or UI change. The v1
  golden hashes do not move.
