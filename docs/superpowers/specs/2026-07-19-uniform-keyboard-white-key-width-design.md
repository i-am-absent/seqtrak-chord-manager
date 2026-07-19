# Uniform Keyboard White-Key Width Design

## Goal

Make the D, G, and A white keys the same width as every other white key.

## Scope

- Change `.piano-key.white.wide-white-key` from `36px` to the normal white-key width of `18px`.
- Update the existing CSS contract test to require `18px`.
- Preserve the `wide-white-key` class assignment, keyboard DOM, key ordering, black-key margins,
  A0 handling, note selection, and preview behavior.

## Verification

Use a test-first change: update the CSS assertion and observe it fail against `36px`, then change
the single CSS width declaration and verify the focused test, frontend suite, and production build.
