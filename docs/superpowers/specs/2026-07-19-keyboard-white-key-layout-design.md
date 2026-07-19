# Keyboard White-Key Layout Design

## Goal

Correct the 88-key keyboard geometry so the D, G, and A white keys use the space beneath the preceding black key, while E and B keep their current width and close the remaining chromatic-grid gap for every key to their right.

## Scope

- Change only the visual layout of `Keyboard88`.
- Preserve all 88 notes, note order, scrolling, interaction, active/candidate states, disabled ranges, and SEQTRAK KEY offset behavior.
- Do not change domain note calculations or MIDI behavior.

## Geometry

The normal key width is 18px.

- A0 remains 18px wide and otherwise unchanged.
- From B0 onward, D, G, and A white keys are 36px wide.
- E, B, C, and F white keys remain 18px wide.
- Black keys remain 14px wide with `margin-left: -7px` and `margin-right: -7px`.

The keyboard container changes from CSS Grid to a horizontal Flex layout. A black key's 14px width plus its two -7px margins gives it zero layout width while preserving its current visible position and overlap. Consequently:

- B0 and every key to its right move left by one 18px key width.
- Each later E or B boundary contributes another cumulative 18px leftward shift to that key and every key to its right.
- D, G, and A occupy 36px, incorporating the preceding black-key column while preserving their previous right-edge position.
- E and B remain 18px wide and move left with all following keys rather than becoming wider.

## Component and Style Responsibilities

`Keyboard88` identifies B0-and-above D, G, and A notes and adds a dedicated semantic CSS class. It does not calculate pixel positions or offsets.

`styles.css` owns the layout:

- `.keyboard` uses horizontal Flex layout and retains its existing height and intrinsic minimum width behavior.
- Every piano key is a non-shrinking Flex item.
- Normal white keys remain 18px.
- The dedicated D/G/A class sets the white-key width to 36px.
- Existing black-key width, margins, and z-index continue to control overlap.

## Interaction and Accessibility

The change does not alter button order, labels, disabled state, click handlers, keyboard accessibility, or focus behavior. Black keys remain above white keys through the existing z-index rules, so their clickable area is not hidden by a wider white key.

## Testing

Tests will verify:

- 88 buttons still render in note order and existing toggle behavior still works.
- A0 does not receive the wide-white-key class.
- D, G, and A from octave 1 onward receive the class.
- B0, E, B, C, F, and black keys do not receive it.
- CSS contracts specify Flex layout, non-shrinking keys, 18px normal white keys, 36px target white keys, and the existing 14px/-7px black-key geometry.
- Existing frontend tests and the production build continue to pass.

## Out of Scope

- Changing keyboard height, colors, note range, labels, scrolling controls, or MIDI behavior.
- Widening E or B.
- Changing A0 width.
- Replacing the keyboard with absolute positioning or per-note transforms.
