import { useMemo, useState } from "react";
import { chromaticKeys, type KeyName } from "../domain/music";
import {
  getRecommendedChordNames,
  getVoicingVariations,
  type VoicingVariation
} from "../domain/recommendations";

interface RecommendationPanelProps {
  packKey: KeyName;
  currentChordName: string;
  onPreview: (notes: number[]) => void;
  onApply: (variation: VoicingVariation, chordName: string) => void;
}

export function RecommendationPanel({
  packKey,
  currentChordName,
  onPreview,
  onApply
}: RecommendationPanelProps) {
  const [selectedKey, setSelectedKey] = useState<KeyName | "pack">("pack");
  const effectiveKey = selectedKey === "pack" ? packKey : selectedKey;
  const chordNames = useMemo(
    () => getRecommendedChordNames(effectiveKey, currentChordName),
    [effectiveKey, currentChordName]
  );
  const [selectedChordName, setSelectedChordName] = useState(chordNames[0]?.name ?? "Dm7");
  const activeChordName = chordNames.some((chord) => chord.name === selectedChordName)
    ? selectedChordName
    : (chordNames[0]?.name ?? "Dm7");
  const variations = getVoicingVariations(effectiveKey, activeChordName);
  const overrideKeys = chromaticKeys.filter((key) => key !== packKey);

  return (
    <section className="panel recommendation-panel" aria-label="Recommendations">
      <div className="recommendation-header">
        <label>
          Recommendation key
          <select
            value={selectedKey}
            onChange={(event) => setSelectedKey(event.target.value as KeyName | "pack")}
          >
            <option value="pack">Pack Key ({packKey})</option>
            {overrideKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="chip-row" aria-label="Recommended chord names">
        {chordNames.map((chord) => (
          <button
            className={chord.name === activeChordName ? "chip selected" : "chip"}
            key={`${chord.name}-${chord.reason}`}
            onClick={() => setSelectedChordName(chord.name)}
            type="button"
          >
            <strong>{chord.name}</strong>
            <span>{chord.reason}</span>
          </button>
        ))}
      </div>

      <div className="variation-row" aria-label="Voicing variations">
        {variations.map((variation) => (
          <button
            className="variation"
            key={variation.variation}
            onClick={() => {
              onPreview(variation.notes);
              onApply(variation, activeChordName);
            }}
            type="button"
          >
            <strong>{variation.variation}</strong>
            <span>{variation.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
