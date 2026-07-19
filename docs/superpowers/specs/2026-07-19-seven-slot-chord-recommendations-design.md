# Seven-Slot Chord Recommendations Design

## Goal

Replace the selected-slot-only, key-relative fixed recommendation list with seven source-specific recommendation areas. Each chord slot supplies its current chord as the harmonic starting point, and the app recommends twelve plausible next chords using deterministic local music-theory rules.

The recommendation source and apply target are deliberately independent: a user may inspect recommendations derived from one slot, preview a voicing, and explicitly apply it to whichever slot is currently selected in the Chord Grid.

## Current Behavior and Problem

The current panel receives only the selected chord name and shows six fixed candidates derived from the recommendation key. `getRecommendedChordNames` accepts `currentChordName` but does not use it, so C, Dm, and G7 receive the same key-relative candidate list. Selecting a voicing currently previews and applies it in one action.

The new design must make the source chord materially affect both the candidate set and its ordering, expose all seven source slots, broaden the harmonic vocabulary, and separate audition from mutation.

## Scope

This phase includes:

- seven source recommendation areas presented as tabs;
- twelve unique next-chord candidates per valid source slot;
- local deterministic theory-based generation and ranking;
- Major and Minor recommendation modes;
- chord-symbol parsing and note-based source inference;
- broader chord qualities and tensions;
- a shared voicing detail area;
- Web Audio audition, keyboard candidate highlighting, and explicit Apply;
- key-aware readable enharmonic spelling.

This phase does not include:

- Supabase statistics, network ranking, personalization, or randomness;
- SEQTRAK-device audition;
- changes to `ChordPack`, shared-pack payloads, the database, SysEx, or MIDI connection behavior;
- persistence of Recommendation mode;
- automatic application to the recommendation source or the following slot.

## Core Terms

- **Source slot:** the recommendation tab whose current chord is used to generate candidates.
- **Target slot:** the currently selected Chord Grid slot that receives an explicit Apply.
- **Conventional candidate:** a functional, diatonic, circle-of-fifths, deceptive, relative-key, stepwise, or close voice-leading continuation.
- **Chromatic candidate:** a continuation produced by a named chromatic technique such as secondary dominant, tritone substitution, modal interchange, or chromatic mediant.
- **Canonical chord:** a pitch-class root plus normalized chord quality/tension, independent of display spelling and slash bass.

## Recommendation Inputs

Each source slot is evaluated with:

- its current `displayName`;
- its stored relative notes converted to absolute notes with the live SEQTRAK KEY offset;
- the shared Recommendation key, defaulting to Pack Key;
- a shared transient Recommendation mode, defaulting to Major.

The existing Recommendation key override remains one shared control for all seven tabs. Recommendation mode is also shared by all tabs, is not stored in `ChordPack`, and resets to Major when a new app session starts.

## Source Chord Resolution

### Symbol parsing

The engine first parses the source slot's `displayName`.

Supported roots are A through G with an optional sharp or flat. Supported canonical chord vocabulary is:

- triads: major, minor, diminished, augmented, sus2, sus4;
- sevenths: maj7, m7, 7, dim7, m7b5;
- tensions and colors: maj9, m9, 9, 11, 13, 7b9, 7#9, 7#11, 7b13, add9, 6/9.

Common textual equivalents such as `dim`, `aug`, `sus`, `ø`, sharp symbols, flat symbols, and ASCII `#`/`b` normalize to the canonical vocabulary. A slash chord such as `Am/C` is treated as `Am` for recommendation generation; the slash bass neither changes the canonical source nor affects ranking.

If the symbol parses successfully, it is authoritative even when the stored notes do not exactly match it.

### Note-based fallback

If the symbol cannot be parsed, the engine infers the nearest canonical chord from the slot's absolute sounding notes. The live SEQTRAK KEY offset participates in this conversion; disconnected operation uses offset zero.

Inference compares unique pitch classes against every root and supported chord template. It minimizes, in order:

1. missing and extra pitch classes;
2. total pitch-class distance to the template;
3. whether the lowest sounding note can be the candidate root;
4. chord-vocabulary complexity order;
5. canonical root pitch class.

The lowest-note root rule is the first tie-breaker after musical distance. A valid one-to-four-note chord therefore always produces a deterministic nearest interpretation. The tab shows `Inferred as <name>` whenever fallback inference was used. Invalid empty or non-finite input is not reachable through a valid `ChordPack`; if encountered defensively, that tab shows a fixed unavailable state without affecting other tabs.

## Candidate Generation

### Hybrid rule engine

Named rule generators receive the canonical source, Recommendation key, and mode. Each emitted candidate contains:

- canonical destination chord;
- concise user-facing reason;
- conventional or chromatic category;
- contextual base priority;
- rule identity for deterministic tie-breaking.

Conventional rule families include:

- mode-aware functional transitions;
- circle-of-fifths movement;
- dominant resolution;
- predominant-to-dominant movement;
- deceptive cadence;
- relative Major or Minor movement;
- stepwise root movement;
- close common-tone voice leading.

Chromatic rule families include:

- secondary dominant;
- tritone substitution;
- modal interchange;
- chromatic mediant;
- backdoor progression;
- Neapolitan or flat-II movement;
- common-tone diminished movement;
- parallel Major or Minor transformation;
- altered dominant movement;
- chromatic semitone-root movement.

Rules are source-sensitive. At minimum, two different canonical source chords under the same key and mode must not produce identical ordered candidate lists.

### Ranking

Within each category, candidate order is deterministic and considers:

1. the named rule's contextual priority for the source quality and scale function;
2. the destination's function in the selected key and mode;
3. shared pitch classes;
4. minimum aggregate voice-leading distance;
5. root direction and distance;
6. repetition of root or closely related quality among higher candidates;
7. rule order, canonical root pitch class, and quality order as final tie-breakers.

There is no random factor and no remote data.

### Selection and deduplication

Candidates are deduplicated by canonical root and canonical quality, before display spelling. The source chord's exact canonical root and quality is excluded; a slash bass does not make an otherwise identical chord eligible.

Each valid source produces exactly:

- six conventional candidates;
- six chromatic candidates;
- twelve total unique candidates.

Generic functional voice-leading and generic chromatic voice-leading generators serve as deterministic fallbacks if named specialized rules do not fill a category. They still provide a short reason.

The first visible group interleaves the top three conventional and top three chromatic candidates. `More` reveals the remaining three conventional and three chromatic candidates. The expanded group remains deterministic and contains no duplicate from the first group.

## Chord Name Display

Canonical roots remain pitch classes internally. Display spelling is derived from the Recommendation key and the theory rule that produced the candidate:

- diatonic destinations follow the selected key and mode;
- borrowed and altered degrees retain the rule's flat or sharp direction;
- enharmonically identical candidates still deduplicate canonically;
- E#, B#, Cb, and Fb are simplified to F, C, B, and E for readability.

The rendered recommendation name becomes the target slot's `displayName` when applied. The internal `KeyName` type and stored Pack Key are unchanged.

## Voicing Generation

The existing four variation concept remains, but generation must support the complete canonical vocabulary.

Basic triads and seventh chords use their canonical chord-tone templates. For 9th, 11th, 13th, and altered dominant chords, the default four-note shell is:

- root;
- major or minor third as required;
- major or minor seventh as required;
- named tension.

The fifth is omitted. `add9` and `6/9` use quality-specific four-note templates because they do not imply a seventh. Diminished, augmented, suspended, and half-diminished qualities use their named chord tones rather than the old major/minor fallback.

The four variations retain distinct close, smooth, wide, and high placement strategies. Every variation must:

- contain one to four unique finite integer notes;
- retain the required pitch classes for its template;
- fit the intersection of the 88-key range and the live KEY-adjusted SEQTRAK chord range;
- remain deterministic.

Preview and Apply use the exact same variation notes.

## User Interface

### Shared controls

The panel header contains:

- one Recommendation key selector, defaulting to Pack Key and applying to all seven tabs;
- one Major/Minor mode selector, defaulting to Major and applying to all seven tabs.

### Seven source tabs

The panel exposes an accessible `tablist` with seven tabs labeled by slot and current chord, for example `Slot 2 — Dm`. Slot 1 is initially active. The tabs represent recommendation sources only and never change the Chord Grid selection.

The tab list scrolls horizontally on narrow screens. The active `tabpanel` shows:

- the source slot and resolved source chord;
- `Inferred as ...` when note fallback was used;
- the first six recommendation chips;
- a `More` control that reveals all twelve;
- each candidate's chord name and concise reason.

No candidate is initially selected. Switching tabs clears the selected candidate, selected variation, keyboard candidate notes, and `More` expansion rather than remembering per-tab state.

### Shared detail and target

Selecting a recommendation chip opens one shared detail area below the tab panel and lists four voicing variations. Selecting a chord name alone does not preview or mutate anything.

Selecting a variation:

- previews its notes through the existing Web Audio `PreviewEngine.playChord` path;
- records that variation as selected;
- sends its notes to `Keyboard88` as orange candidate notes;
- does not change the pack.

The detail area always shows the current independent target, for example `Target: Slot 6 — Am`. Changing the Chord Grid selection updates only this target display; it does not clear the source recommendation or selected variation.

An explicit `Apply <chord> to Slot <n>` button is disabled until both a recommendation and variation are selected. Apply writes the selected variation and rendered chord name only to the current Chord Grid target. It then clears the recommendation, variation, candidate keyboard notes, and preview detail state.

### Reset conditions

The recommendation/variation/candidate selection and `More` expansion clear when:

- the source tab changes;
- the active source slot's chord name or notes change;
- Recommendation key changes;
- Recommendation mode changes;
- Apply completes.

Changes to a non-active source slot do not disturb the active selection. A target-slot-only change updates the Apply destination without clearing the preview selection.

## Preview Behavior

Preview reuses the implemented Web Audio engine:

- the `AudioContext` is created lazily on first preview;
- sawtooth oscillators play the candidate chord for approximately 0.7 seconds with the existing gain envelope;
- unavailable Web Audio falls back to the existing silent `NullPreviewEngine`;
- silent fallback does not disable Apply.

SEQTRAK-device audition remains out of scope.

## State and Component Boundaries

Music-theory behavior remains outside React components. The design separates:

- chord symbol parsing, canonicalization, and display spelling;
- note-based chord inference;
- theory rule generation, scoring, category balancing, and deduplication;
- quality-aware voicing generation and range fitting;
- Recommendation panel interaction state;
- App-level preview, candidate-key highlighting, and reducer dispatch to the current target.

The panel receives all seven chord slots, live KEY offset, Pack Key, and current target information. It emits preview notes, candidate-note state, and explicit apply data. It does not write MIDI or mutate a pack directly.

## Error Handling

- One malformed source never prevents other source tabs from rendering.
- Defensive unavailable states use fixed UI copy and do not expose raw errors.
- A failed or unavailable Web Audio context produces silence but no pack mutation or UI crash.
- Apply stays disabled until the selected candidate has a valid in-range variation.
- Candidate generation must never return duplicate keys or fewer than twelve candidates for valid input.

## Testing Requirements

### Domain tests

- each of seven distinct source chords receives its own source-sensitive list;
- every valid source produces twelve unique candidates;
- the first six contain exactly three conventional and three chromatic candidates;
- the remaining group contains the other three of each category;
- exact source chords and enharmonic duplicates are excluded;
- key transposition and Major/Minor mode change results deterministically;
- each named rule family emits candidates with concise reasons in applicable fixtures;
- source parser covers every supported quality, tension, accidental style, and slash chord;
- unsupported names fall back to live-KEY-adjusted note inference;
- inference prefers the lowest sounding note as root on an otherwise equal match;
- key-aware display uses readable sharp/flat spellings and avoids E#/B#/Cb/Fb;
- tension shells contain root, third, seventh, and tension while omitting fifth;
- all four variations are unique, valid, deterministic, and fit the KEY-adjusted apply range.

### Component tests

- seven accessible tabs show current slot chord labels;
- tab changes are independent of Chord Grid target selection;
- six candidates show initially and `More` reveals twelve;
- candidate selection opens the common variation detail without preview or Apply;
- variation selection previews and publishes candidate notes without pack mutation;
- Apply is disabled before variation selection and targets the current selected slot afterward;
- target-only changes preserve the selected source/variation;
- tab, active-source, key, mode, and Apply transitions clear the specified state;
- inferred source labels appear only for fallback analysis;
- narrow layout keeps tabs operable through horizontal scrolling CSS contracts.

### App and regression tests

- keyboard candidate highlighting uses absolute preview notes;
- Apply converts absolute notes through the live KEY offset and updates only the selected target slot;
- source and target may be different slots;
- Web Audio preview is lazy and Apply remains explicit;
- existing editor, MIDI, SCALE, KEY, sharing, reset, publication, and deployment tests remain green.

## Acceptance Criteria

The feature is accepted when a user can inspect any of seven source tabs, see twelve source-dependent next-chord recommendations with balanced conventional and chromatic choices, preview one of four valid voicings through Web Audio and on the keyboard, and explicitly apply it to an independently selected target slot without unintended changes elsewhere.
