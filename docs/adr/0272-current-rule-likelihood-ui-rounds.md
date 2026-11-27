# 0272. Decision records state the current rule, their likelihood, and group UI rounds

- Status: Accepted
- Date: 2026-11-27
- Source: issue #498 (code review 2026-11, tracking #435); owner decision 2026-11-16 on #498
  (option B, decision text approved, then numbered 0238); owner decision 2026-11-27 on #498
  (implement as approved, renumbered 0272)
- Amends: [0001](0001-behaviour-change-gate.md) (a round of layout or styling adjustments
  shares one ADR), [0152](0152-wording-log-and-generated-index.md) (the template and the
  generated index gain Topic, Trigger and Likelihood)
- Topic: Process: decision records
- Trigger: n/a (process record)
- Likelihood: n/a (adds no handling)

## Context

The review behind #498 counted the records in `docs/adr/` at its base:

- 205 records, 145 of them added in the seven weeks after the public release.
- 108 records add handling for an edge case. About five trace to something met in real use;
  the rest come from review findings, probe tests, mutation tests or "could happen"
  reasoning. Nothing in the process asks how likely a case is.
- 96 records carry "Amended by". ADR 0109 (loan prepayments) has seven amenders, 0107
  (sections) seven, 0118 (Data check) six. An amendment changes the old record's header, not
  its body, so the current rule is found only by reading the whole chain.
- 31 records in four weeks (0195–0225) are single UI adjustments, because CLAUDE.md §8 asks
  for a record per user-visible change.
- The index lists records by number only.

On 2026-11-16 the owner chose option B: restate long chains, add a likelihood line, and let a
round of UI adjustments share one record. The decision text was approved under the number 0238. The record was not written then, and later records took the numbers up to 0271, so on
2026-11-27 the owner had it implemented as approved under 0272. **0238 stays a gap**: no record has that number and none
will be given it.

## Decision

1. **Current-rule records.** An ADR with three or more amenders gets one superseding record
   that states the rule as it is now, in full, without the reader having to open the chain.
   The old chain is marked superseded, both sides linked (ADR 0152): the restated record and
   each amender whose content the new record restates in full get `Status: Superseded by
NNNN`; an amender that also decides other things gets `Superseded in part by: NNNN`. The first three are prepayments and
   recasts (0109), sections (0107) and the Data check (0118).
   From now on, a change to an ADR that already has three amenders is written as that
   superseding record, not as a fourth amendment. A change to an ADR with fewer amenders
   may still amend it.
2. **Trigger and Likelihood.** The template gains two required lines for any record that
   adds handling:
   - **Trigger**: what the user must do to reach the case.
   - **Likelihood**: one of **routine**, **plausible**, **rare** or **practically never**.

   A "practically never" case gets a refusal with a message, or nothing. It never gets a model
   of the case. A record that adds no handling (a process or tooling record, say) writes
   `n/a` in both lines.

3. **UI rounds share one record.** A round of user-visible layout or styling adjustments that
   changes no rule, limit, stored data or export shares one ADR with numbered items, as 0144
   and 0225 already do. Any change to a rule, limit, rejection, stored data or export still
   gets its own ADR. The gate of ADR 0001 is otherwise unchanged: an accepted ADR and a failing
   test written first.
4. **The index.** `pnpm adr:index` adds a Topic column, taken from a `Topic:` header line
   (an area and a subject, such as "Loans: prepayments"). `pnpm adr:check` requires the
   `Topic`, `Trigger` and `Likelihood` lines on every record from 0272 on and checks that
   Likelihood starts with one of the four levels or `n/a`. Records before 0272 are not
   checked for them.
5. **The delegated records.** ADRs 0198–0225, which carried "Accepted (delegated, owner review
   pending)", are accepted as they stand (owner, 2026-11-16). Their status already reads
   Accepted.

## Consequences

- `docs/adr/README.md` (the steps and the template) and CONTRIBUTING.md describe the three
  new lines, current-rule records and UI rounds. CLAUDE.md §8 gets the approved sentence in
  its own change, since that file is the owner's.
- The three current-rule records for 0109, 0107 and 0118 follow, one docs change each.
  Sixteen other records have three or more amenders today; each is restated when it is next
  changed, under point 1. `pnpm adr:check` does not count amenders, so an existing chain
  never fails the check.
- Topics of records before 0272 are blank in the index until a record is restated or its
  header is next edited; adding a `Topic:` line to an old record is allowed at any time.
- Fewer records per UI review round, and a stated likelihood on every new edge case, so a
  "practically never" case is refused instead of modelled.
