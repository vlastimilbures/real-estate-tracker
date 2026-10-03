# 0080. Close-out before 1.3.0: lease steps and gaps, real-terms month count, review leftovers

- Status: Accepted
- Date: 2026-10-02
- Source IDs: DR-045, DR-182, DR-145, DR-152, DR-157, DR-181 (P18 plan)
- Builds on: D-21, D-22, D-45, D-62, D-78, ADR 0001, ADR 0003, ADR 0079
  (legacy IDs, ADR 0081)

## Context

- **DR-045.** The snapshot takes the rent of the lease in force at its date (0 in a gap),
  but the projection takes one lease — the one in force at the basis date, else the nearest
  upcoming — and indexes it for the whole horizon. It never models a gap between leases or
  the step to a new lease's rent. The seed's Lipova lease steps 21,675 → 23,205 on
  2026-09-01 and the projection still uses 21,675.
- **DR-182.** `cpiAt` counts whole completed months from baseDate (`monthsBetween`), so with
  baseDate on 29 Feb the real snapshot one year later deflates 11 months while projection
  year 1 deflates a full year — the month-end case ADR 0079 fixed for value growth only.
- **DR-145.** The Compare key figures are a grid of divs: a screen reader gets no table,
  row or column headers.
- **DR-152.** Excel export sheet names stay English although the column headers follow the
  UI language (UX-062).
- **DR-157.** The database, its backups and the window-state file are created 0644; only the
  0700 parent folders keep them private.
- **DR-181.** Scenarios store `created_at` as a date only, so scenarios created on the same
  day sort by their random id.

## Decision

Owner, 2026-10-02 (P18 plan):

1. **Projection rent follows the leases month by month (DR-045, ADR 0003).** Each projection
   month takes the rent of the lease in force on that month's grid date (baseDate + m months
   on the D-21 month-end grid, the grid loans and turn-on already use); no lease in force
   means no rent that month, as in the snapshot. A new lease's contractual rent replaces the
   old one from its start (Czech practice: a new contract re-prices the flat; a vacancy
   between contracts earns nothing). A gap that holds no grid date costs nothing. Each
   lease's rent is indexed from its own turn-on year, as a future lease already is.
2. **The last lease keeps renting.** A lease with an end date and no later lease is treated
   as renewed: its rent continues, indexed. Only a gap between two leases is zero. A last
   lease that ended before the basis date still gives no rent.
3. **Real terms count months on the month-end grid (DR-182).** `cpiAt` uses
   `lastGridMonthOnOrBefore`, so the real snapshot equals the real projection row at every
   `baseDate + N years`, as ADR 0079 decided for value growth.
4. **Compare key figures are a table (DR-145, UX-081)** with a caption, column headers
   (scenario names) and row headers (metrics). The UX-079 n/a note stays.
5. **Excel sheet names follow the UI language (DR-152, UX-080)**, within Excel's 31-character
   limit and without `[]:*?/\`.
6. **Private files are 0600 (DR-157).** At start-up the app folder becomes 0700 and every
   regular file in it and in `backups/` 0600; app backups are written 0600. No new
   dependency. A database created on first run is fixed at the next start.
7. **Scenarios keep their creation order (DR-181).** New scenarios store `created_at` as a
   full ISO timestamp; `ORDER BY created_at, id` sorts older date-only rows first (by id, as
   today) and newer ones by creation time. No migration.

## Consequences

Decision 1 moves the seed's projection targets (Lipova's rent steps to 23,205 from
grid month 3): the old → new values are in the target change log
(`.claude/rules/engine-parity.md`) and the golden master is updated in the same commit
(ADR 0039). Decision 3 changes real values only at month-end bases (no seed impact).
Decisions 4–5 are user-visible (ADR 0001, UX-080/081). Decisions 6–7 change no number.
