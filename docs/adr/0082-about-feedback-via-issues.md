# 0082. About dialog points to GitHub issues instead of an e-mail address

- Status: Accepted
- Date: 2026-10-03
- Builds on: ADR 0081, UX-064 (legacy ID)

## Context

The About dialog showed the developer's personal e-mail address. In a public repository and
public release that address invites spam, and feedback is better kept where others can see
and follow it.

## Decision

Owner, 2026-10-03: the About dialog's "Email" row becomes **"Feedback"** with the issues
address `github.com/vlastimilbures/real-estate-tracker/issues`, in English, Czech and Russian.
It stays plain, selectable text — the offline app opens no links (UX-064).

## Consequences

User-visible (ADR 0001): a test asserts the feedback address is shown and that the dialog
contains no e-mail address. Security reports go through GitHub advisories (`SECURITY.md`).
