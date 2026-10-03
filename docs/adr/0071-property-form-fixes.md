# 0071. Property form: visible garage checkbox, extras saved on add, active flag kept on edit

- Status: Accepted
- Date: 2026-10-02

## Context

Three defects in the property add/edit form, found by the owner and in review:

1. In the macOS app (WebKit) the Garage field showed only the text "Yes" with no tickable box:
   the text-field rules `.field input` (width 100%, padding, border, background) also matched
   the checkbox and collapsed its native rendering. Chromium (ux-capture) still drew it.
2. Adding a property dropped the address and garage: `addProperty` wrote the row without them.
3. Editing an inactive property re-activated it: the form's `Property` carries no `active`
   flag and `propertyToRow` writes a missing flag as active.

## Decision

1. The `.field input` text-control rules exclude `type="checkbox"`; checkboxes in
   `.checkbox-label` get their own fixed-size rule with the accent colour and a focus ring.
2. `addProperty` takes the address/garage extras and persists them, as `editProperty` does.
3. `editProperty` keeps the stored `active` flag when the edited `Property` omits it.

## Consequences

The form now does what it already promised; no computed number changes. Store tests cover
(2) and (3); (1) is CSS only and was checked by the owner in the app.
