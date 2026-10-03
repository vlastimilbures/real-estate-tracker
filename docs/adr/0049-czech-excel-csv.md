# 0049. Czech-Excel CSV files are rejected precisely

- Status: Accepted
- Date: 2026-10-01
- Source IDs: D-49, J-12

## Context

Czech Excel writes CSV with ';', decimal comma and Windows-1250 (J-12).

Options considered for J-12 (Czech-Excel CSV files (`;`, decimal comma, CP1250)): (a) strict rejection with a precise message; (b) auto-detect and convert. Recommendation at planning: (a); (b) goes to the backlog

## Decision

**Czech-Excel CSV (answers J-12):** option (a) — strict rejection with a precise message for a `;` delimiter, decimal comma or Windows-1250 bytes; auto-convert (b) goes to the backlog.

Related follow-up decisions:

- **D-55**: **CSV property-name matching (answers DR-025):** a CSV name matches an existing property after trimming, case-insensitively; the stored spelling is kept. Two names in one file that differ only by case or surrounding spaces are a duplicate (fatal). No schema change.

## Consequences

P5b implements it with DR-036 (new messages en/cs/ru).
