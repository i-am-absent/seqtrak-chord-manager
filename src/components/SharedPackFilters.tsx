import { useState } from "react";
import { chromaticKeys, type KeyName } from "../domain/music";
import type { SearchPackFilters } from "../sharing/types";

export interface SharedPackFiltersProps {
  queryDraft: string;
  authorDraft: string;
  filters: SearchPackFilters;
  composing: boolean;
  onQueryDraftChange: (value: string) => void;
  onAuthorDraftChange: (value: string) => void;
  onCompositionChange: (composing: boolean) => void;
  onFiltersChange: (filters: SearchPackFilters) => void;
  onClear: () => void;
}

export function SharedPackFilters({
  queryDraft,
  authorDraft,
  filters,
  composing: _composing,
  onQueryDraftChange,
  onAuthorDraftChange,
  onCompositionChange,
  onFiltersChange,
  onClear,
}: SharedPackFiltersProps) {
  const [tagDraft, setTagDraft] = useState("");
  const tags = filters.tags ?? [];
  const addTag = () => {
    const tag = tagDraft.replace(/^ +| +$/g, "");
    if (
      !tag ||
      [...tag].length > 30 ||
      tags.length >= 10 ||
      tags.some((current) => current.toLowerCase() === tag.toLowerCase())
    ) return;
    onFiltersChange({ ...filters, tags: [...tags, tag] });
    setTagDraft("");
  };
  const hasText = (value?: string) => Boolean(value?.replace(/^ +| +$/g, ""));
  const hasValues = Boolean(
    hasText(queryDraft) ||
    hasText(authorDraft) ||
    hasText(filters.query) ||
    hasText(filters.author) ||
    filters.key ||
    tags.length,
  );
  const handleClear = () => {
    setTagDraft("");
    onClear();
  };

  return (
    <form className="shared-filters" onSubmit={(event) => event.preventDefault()}>
      <div className="shared-filter-fields">
        <label>
          Search packs
          <input
            type="search"
            value={queryDraft}
            onChange={(event) => onQueryDraftChange(event.target.value)}
            onCompositionStart={() => onCompositionChange(true)}
            onCompositionEnd={() => onCompositionChange(false)}
          />
        </label>
        <label>
          Author
          <input
            value={authorDraft}
            onChange={(event) => onAuthorDraftChange(event.target.value)}
            onCompositionStart={() => onCompositionChange(true)}
            onCompositionEnd={() => onCompositionChange(false)}
          />
        </label>
        <label>
          Pack Key
          <select
            value={filters.key ?? ""}
            onChange={(event) => onFiltersChange({
              ...filters,
              key: event.target.value ? event.target.value as KeyName : undefined,
            })}
          >
            <option value="">All Keys</option>
            {chromaticKeys.map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
        </label>
      </div>
      <div className="shared-tag-filter">
        <label>
          Tags
          <input
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTag();
              }
            }}
          />
        </label>
        <button type="button" onClick={addTag}>Add tag</button>
      </div>
      <div className="shared-filter-chips" aria-label="Required tags">
        {tags.map((tag) => (
          <span className="shared-filter-chip" key={tag.toLowerCase()}>
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onFiltersChange({
                ...filters,
                tags: tags.filter((current) => current !== tag),
              })}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button type="button" disabled={!hasValues} onClick={handleClear}>
        Clear filters
      </button>
    </form>
  );
}
