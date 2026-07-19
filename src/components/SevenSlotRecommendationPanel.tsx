import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  chromaticKeys,
  type ChordSlot,
  type KeyName,
} from "../domain/music";
import {
  getChordRecommendations,
  type ChordRecommendation,
} from "../domain/recommendations";
import type { RecommendationMode } from "../domain/chordSymbols";
import {
  getChordVoicingVariations,
  type VoicingVariation,
} from "../domain/voicings";

interface SevenSlotRecommendationPanelProps {
  chords: ChordSlot[];
  packKey: KeyName;
  keyOffset: number;
  targetSlotIndex: number;
  onPreview: (notes: number[]) => void;
  onCandidateNotesChange: (notes: number[]) => void;
  onApply: (variation: VoicingVariation, chordName: string) => void;
}

export function SevenSlotRecommendationPanel({
  chords,
  packKey,
  keyOffset,
  targetSlotIndex,
  onPreview,
  onCandidateNotesChange,
  onApply,
}: SevenSlotRecommendationPanelProps) {
  const [selectedKey, setSelectedKey] = useState<KeyName | "pack">("pack");
  const [mode, setMode] = useState<RecommendationMode>("major");
  const [sourceSlotIndex, setSourceSlotIndex] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] =
    useState<ChordRecommendation | null>(null);
  const [selectedVariation, setSelectedVariation] = useState<VoicingVariation | null>(null);

  const candidateNotesCallbackRef = useRef(onCandidateNotesChange);
  candidateNotesCallbackRef.current = onCandidateNotesChange;

  const clearPreviewSelection = useCallback(
    ({ collapseMore }: { collapseMore: boolean }) => {
      setSelectedRecommendation(null);
      setSelectedVariation(null);
      candidateNotesCallbackRef.current([]);
      if (collapseMore) {
        setExpanded(false);
      }
    },
    [],
  );

  const effectiveKey = selectedKey === "pack" ? packKey : selectedKey;
  const effectiveKeyRoot = chromaticKeys.indexOf(effectiveKey);
  const activeSource = chords.find((chord) => chord.slotIndex === sourceSlotIndex);
  const activeSourceFingerprint = activeSource
    ? `${activeSource.displayName}:${activeSource.notes.join(",")}`
    : "missing:";
  const target = chords.find((chord) => chord.slotIndex === targetSlotIndex);

  const recommendationSet = useMemo(
    () =>
      activeSource
        ? getChordRecommendations({
            keyRoot: effectiveKeyRoot,
            mode,
            sourceDisplayName: activeSource.displayName,
            sourceRelativeNotes: activeSource.notes,
            keyOffset,
          })
        : { source: null, candidates: [] },
    [activeSourceFingerprint, effectiveKeyRoot, keyOffset, mode],
  );

  const variations = useMemo(
    () =>
      selectedRecommendation
        ? getChordVoicingVariations(selectedRecommendation.chord, keyOffset)
        : [],
    [keyOffset, selectedRecommendation],
  );

  useEffect(() => {
    clearPreviewSelection({ collapseMore: true });
  }, [activeSourceFingerprint, clearPreviewSelection, effectiveKey, keyOffset, mode]);

  useEffect(
    () => () => {
      candidateNotesCallbackRef.current([]);
    },
    [],
  );

  function selectSource(slotIndex: number) {
    clearPreviewSelection({ collapseMore: true });
    setSourceSlotIndex(slotIndex);
  }

  function selectRecommendation(recommendation: ChordRecommendation) {
    setSelectedRecommendation(recommendation);
    setSelectedVariation(null);
    candidateNotesCallbackRef.current([]);
  }

  function selectVariation(variation: VoicingVariation) {
    setSelectedVariation(variation);
    onPreview(variation.notes);
    candidateNotesCallbackRef.current(variation.notes);
  }

  function applySelection() {
    if (!selectedRecommendation || !selectedVariation) {
      return;
    }
    onApply(selectedVariation, selectedRecommendation.name);
    clearPreviewSelection({ collapseMore: true });
  }

  return (
    <section className="panel seven-slot-recommendation-panel" aria-label="Recommendations">
      <div className="recommendation-header">
        <label>
          Recommendation key
          <select
            value={selectedKey}
            onChange={(event) => {
              clearPreviewSelection({ collapseMore: true });
              setSelectedKey(event.target.value as KeyName | "pack");
            }}
          >
            <option value="pack">Pack Key ({packKey})</option>
            {chromaticKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>

        <label>
          Recommendation mode
          <select
            value={mode}
            onChange={(event) => {
              clearPreviewSelection({ collapseMore: true });
              setMode(event.target.value as RecommendationMode);
            }}
          >
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </label>
      </div>

      <div className="recommendation-tabs" role="tablist" aria-label="Recommendation sources">
        {chords.map((chord) => (
          <button
            key={chord.slotIndex}
            id={`recommendation-tab-${chord.slotIndex}`}
            role="tab"
            type="button"
            aria-controls="recommendation-source-panel"
            aria-selected={sourceSlotIndex === chord.slotIndex}
            onClick={() => selectSource(chord.slotIndex)}
          >
            {`Slot ${chord.slotIndex} — ${chord.displayName}`}
          </button>
        ))}
      </div>

      <div
        id="recommendation-source-panel"
        className="recommendation-source-panel"
        role="tabpanel"
        aria-labelledby={`recommendation-tab-${sourceSlotIndex}`}
      >
        {activeSource && (
          <p>{`Source: Slot ${activeSource.slotIndex} — ${activeSource.displayName}`}</p>
        )}
        {recommendationSet.source?.inferred && (
          <p>{`Inferred as ${recommendationSet.source.name}`}</p>
        )}

        {recommendationSet.source ? (
          <>
            <div className="chip-row" aria-label="Recommended chord names">
              {recommendationSet.candidates.slice(0, expanded ? 12 : 6).map((recommendation) => (
                <button
                  className={
                    recommendation === selectedRecommendation ? "chip selected" : "chip"
                  }
                  key={`${recommendation.category}-${recommendation.ruleId}-${recommendation.name}`}
                  type="button"
                  aria-label={`Recommendation: ${recommendation.name} — ${recommendation.reason}`}
                  onClick={() => selectRecommendation(recommendation)}
                >
                  <strong>{recommendation.name}</strong>
                  <span>{recommendation.reason}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setExpanded((current) => !current)}>
              {expanded ? "Fewer recommendations" : "More recommendations"}
            </button>
          </>
        ) : (
          <p>Recommendations unavailable for this slot.</p>
        )}
      </div>

      <div className="recommendation-detail" aria-live="polite">
        {target && <p>{`Target: Slot ${target.slotIndex} — ${target.displayName}`}</p>}
        {selectedRecommendation ? (
          <>
            <div className="variation-row" aria-label="Voicing variations">
              {variations.map((variation) => (
                <button
                  className={variation === selectedVariation ? "variation selected" : "variation"}
                  key={variation.variation}
                  type="button"
                  aria-label={`Preview variation ${variation.variation} ${variation.label}`}
                  onClick={() => selectVariation(variation)}
                >
                  <strong>{variation.variation}</strong>
                  <span>{variation.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={!selectedVariation}
              onClick={applySelection}
            >
              {`Apply ${selectedRecommendation.name} to Slot ${targetSlotIndex}`}
            </button>
          </>
        ) : (
          <p>Select a recommendation</p>
        )}
      </div>
    </section>
  );
}
