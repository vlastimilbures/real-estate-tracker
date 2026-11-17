// Stylesheet lint (#460, `pnpm lint:css`). No shared config: Prettier owns formatting, so
// only rules that catch real mistakes are on. `scripts/css-dead-classes.mjs` runs after
// it for what stylelint cannot see (classes and custom properties unused across TSX).
/** @type {import("stylelint").Config} */
export default {
  reportNeedlessDisables: true,
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  rules: {
    // A selector defined twice in one context makes the result depend on file order;
    // `disallowInList` also catches one repeated as a member of a selector list.
    "no-duplicate-selectors": [true, { disallowInList: true }],
    // A fallback written straight before its modern form stays allowed.
    "declaration-block-no-duplicate-properties": [
      true,
      { ignore: ["consecutive-duplicates-with-different-syntaxes"] },
    ],
    "declaration-no-important": true,
    // Colours are tokens (tokens.css); everywhere else uses var(--…) or a keyword.
    "color-no-hex": true,
    // Stacking and type sizes are tokens too (#495): z-index reads a --z-* token and
    // font-size a --fs-* one; the font shorthand, which would reset the size, only
    // inherits.
    "declaration-property-value-allowed-list": {
      "z-index": ["/^var\\(--z-[\\w-]+\\)$/"],
      "font-size": ["/^var\\(--fs-[\\w-]+\\)$/"],
      font: ["inherit"],
    },
  },
  overrides: [
    {
      files: ["src/ui/styles/tokens.css"],
      rules: { "color-no-hex": null },
    },
  ],
};
