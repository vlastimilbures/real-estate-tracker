# 0105. One product name on every surface; language does not change formats

- Status: Accepted
- Date: 2026-10-03
- Source: issue #22 (pre-release review 2026-10, finding A16)
- Extends: [0076](0076-csv-int-bounds-and-app-name.md)

## Context

ADR 0076 named the app "Real Estate Tracker" in the window title, the page title, the About
menu item and the About page. Three surfaces still say "Real Estate Portfolio": the sidebar
brand, the logo's accessible title and the loading screen eyebrow (in Czech "Realitní
portfolio", in Russian "Портфель недвижимости"). No test covers them.

The interface is translated into English, Czech and Russian, but amounts are always Czech
crowns with Czech number and date formats (SPEC §8: CZK locked). Nothing in the app says so,
so a user may read the Czech formats in the English interface as a localisation bug, or
expect a language switch to change the currency.

## Decision

Owner, 2026-10-03 (#22 plan):

1. **Every brand surface uses the product name "Real Estate Tracker".** The sidebar brand
   shows it on two lines ("Real Estate" / "Tracker"); the logo title and the loading screen
   eyebrow use it too. The name is not translated: Czech and Russian show the same name, as
   the bundle, the menu bar and About already do. One constant holds the name; a test pins
   the files that cannot import it (`tauri.conf.json`, `index.html`, the Rust menu) to it.
2. **About and the Guide say what the language setting changes.** One line, in all three
   languages: "Language changes the interface text only. Amounts are always in Czech crowns
   (Kč) with Czech number and date formats." About shows it under "What this app does"; the
   Guide shows it under "How it works".

Real multi-currency or locale-dependent formatting stays out of scope (a roadmap item that
would need its own scope ADR).

## Consequences

Display only: no computed number, parity target, golden master or engine output changes. The
visible name changes in three places; one new string in en, cs and ru.
