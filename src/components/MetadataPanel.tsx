import { chromaticKeys, type ChordPack, type KeyName } from "../domain/music";

interface MetadataPanelProps {
  pack: ChordPack;
  onChange: (patch: Partial<Pick<ChordPack, "packName" | "authorName" | "tags" | "key">>) => void;
}

export function MetadataPanel({ pack, onChange }: MetadataPanelProps) {
  return (
    <section className="panel metadata-panel" aria-label="Pack metadata">
      <label>
        Track sound
        <input value={pack.trackSoundName} readOnly />
      </label>
      <label>
        Pack name
        <input value={pack.packName} onChange={(event) => onChange({ packName: event.target.value })} />
      </label>
      <label>
        Author
        <input value={pack.authorName} onChange={(event) => onChange({ authorName: event.target.value })} />
      </label>
      <label>
        Tags
        <input
          value={pack.tags.join(", ")}
          onChange={(event) =>
            onChange({
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
            })
          }
        />
      </label>
      <label>
        Pack key
        <select value={pack.key} onChange={(event) => onChange({ key: event.target.value as KeyName })}>
          {chromaticKeys.map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
