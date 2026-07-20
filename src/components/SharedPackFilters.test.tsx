import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { chromaticKeys } from "../domain/music";
import type { SearchPackFilters } from "../sharing/types";
import { SharedPackFilters } from "./SharedPackFilters";

function Harness({ initial = {} }: { initial?: SearchPackFilters }) {
  const [filters, setFilters] = useState(initial);
  const [queryDraft, setQueryDraft] = useState(initial.query ?? "");
  const [authorDraft, setAuthorDraft] = useState(initial.author ?? "");
  const [composing, setComposing] = useState(false);
  return (
    <SharedPackFilters
      queryDraft={queryDraft}
      authorDraft={authorDraft}
      filters={filters}
      composing={composing}
      onQueryDraftChange={setQueryDraft}
      onAuthorDraftChange={setAuthorDraft}
      onCompositionChange={setComposing}
      onFiltersChange={setFilters}
      onClear={() => {
        setQueryDraft("");
        setAuthorDraft("");
        setFilters({});
      }}
    />
  );
}

describe("SharedPackFilters", () => {
  it("groups the three primary controls in the responsive filter fields", () => {
    const { container } = render(<Harness />);
    const fields = container.querySelector(".shared-filter-fields");
    expect(fields).toBeInTheDocument();
    expect(Array.from(fields!.children, (child) => child.tagName)).toEqual([
      "LABEL",
      "LABEL",
      "LABEL",
    ]);
    expect(Array.from(fields!.children, (child) => child.textContent?.trim())).toEqual([
      "Search packs",
      "Author",
      `Pack KeyAll Keys${chromaticKeys.join("")}`,
    ]);
  });

  it("labels every control and offers all twelve pack keys", () => {
    render(<Harness />);
    expect(screen.getByRole("searchbox", { name: "Search packs" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Author" })).toBeInTheDocument();
    const key = screen.getByRole("combobox", { name: "Pack Key" });
    expect(screen.getByRole("textbox", { name: "Tags" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add tag" })).toBeInTheDocument();
    expect(Array.from(key.querySelectorAll("option"), (option) => option.value)).toEqual([
      "",
      ...chromaticKeys,
    ]);
  });

  it("updates drafts immediately and emits selected keys", async () => {
    const onQueryDraftChange = vi.fn();
    const onAuthorDraftChange = vi.fn();
    const onFiltersChange = vi.fn();
    render(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{ tags: ["pop"] }}
        composing={false}
        onQueryDraftChange={onQueryDraftChange}
        onAuthorDraftChange={onAuthorDraftChange}
        onCompositionChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("searchbox", { name: "Search packs" }), {
      target: { value: "pads" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Author" }), {
      target: { value: "Ada" },
    });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Pack Key" }), "F#");
    expect(onQueryDraftChange).toHaveBeenCalledWith("pads");
    expect(onAuthorDraftChange).toHaveBeenCalledWith("Ada");
    expect(onFiltersChange).toHaveBeenCalledWith({ tags: ["pop"], key: "F#" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Pack Key" }), "");
    expect(onFiltersChange).toHaveBeenLastCalledWith({ tags: ["pop"], key: undefined });
  });

  it("adds normalized unique tags and removes them accessibly", async () => {
    const onChange = vi.fn();
    const filters = { tags: ["pop"] };
    render(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{ tags: ["pop"] }}
        composing={false}
        onQueryDraftChange={vi.fn()}
        onAuthorDraftChange={vi.fn()}
        onCompositionChange={vi.fn()}
        onFiltersChange={onChange}
        onClear={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "  BRIGHT  ");
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onChange).toHaveBeenCalledWith({ ...filters, tags: ["pop", "BRIGHT"] });
    await userEvent.click(screen.getByRole("button", { name: "Remove tag pop" }));
    expect(onChange).toHaveBeenCalledWith({ ...filters, tags: [] });
  });

  it("accepts thirty astral Unicode code points through native typing", async () => {
    const onFiltersChange = vi.fn();
    const tag = "😀".repeat(30);
    render(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{}}
        composing={false}
        onQueryDraftChange={vi.fn()}
        onAuthorDraftChange={vi.fn()}
        onCompositionChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), tag);
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ tags: [tag] });
  });

  it("suppresses a case-insensitive duplicate after the controlled value rerenders", async () => {
    const onFiltersChange = vi.fn();
    const props = {
      queryDraft: "",
      authorDraft: "",
      composing: false,
      onQueryDraftChange: vi.fn(),
      onAuthorDraftChange: vi.fn(),
      onCompositionChange: vi.fn(),
      onFiltersChange,
      onClear: vi.fn(),
    };
    const view = render(<SharedPackFilters {...props} filters={{}} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "Bright");
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onFiltersChange).toHaveBeenCalledWith({ tags: ["Bright"] });

    view.rerender(<SharedPackFilters {...props} filters={{ tags: ["Bright"] }} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Tags" }), "bRIGHT");
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
  });

  it("adds tags with Enter and suppresses blank, duplicate, overlong, and eleventh tags", async () => {
    const onFiltersChange = vi.fn();
    const tenTags = Array.from({ length: 10 }, (_, index) => `tag-${index}`);
    const view = render(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{ tags: ["Pop"] }}
        composing={false}
        onQueryDraftChange={vi.fn()}
        onAuthorDraftChange={vi.fn()}
        onCompositionChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Tags" });
    await userEvent.type(input, "jazz{Enter}");
    expect(onFiltersChange).toHaveBeenCalledWith({ tags: ["Pop", "jazz"] });

    for (const rejected of ["   ", "pOP", "🎵".repeat(31)]) {
      fireEvent.change(input, { target: { value: rejected } });
      await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    }
    expect(onFiltersChange).toHaveBeenCalledTimes(1);

    view.rerender(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{ tags: tenTags }}
        composing={false}
        onQueryDraftChange={vi.fn()}
        onAuthorDraftChange={vi.fn()}
        onCompositionChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Tags" }), {
      target: { value: "eleventh" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onFiltersChange).toHaveBeenCalledTimes(1);
  });

  it("reports IME composition for both draft inputs without changing filters", () => {
    const onCompositionChange = vi.fn();
    const onFiltersChange = vi.fn();
    render(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{}}
        composing={false}
        onQueryDraftChange={vi.fn()}
        onAuthorDraftChange={vi.fn()}
        onCompositionChange={onCompositionChange}
        onFiltersChange={onFiltersChange}
        onClear={vi.fn()}
      />,
    );
    for (const input of [
      screen.getByRole("searchbox", { name: "Search packs" }),
      screen.getByRole("textbox", { name: "Author" }),
    ]) {
      fireEvent.compositionStart(input);
      fireEvent.compositionEnd(input);
    }
    expect(onCompositionChange.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(onFiltersChange).not.toHaveBeenCalled();
  });

  it("enables Clear only for active controlled values and delegates clearing", async () => {
    const onClear = vi.fn();
    const props = {
      composing: false,
      onQueryDraftChange: vi.fn(),
      onAuthorDraftChange: vi.fn(),
      onCompositionChange: vi.fn(),
      onFiltersChange: vi.fn(),
      onClear,
    };
    const view = render(
      <SharedPackFilters
        queryDraft=""
        authorDraft=""
        filters={{}}
        {...props}
      />,
    );
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeDisabled();
    for (const active of [
      { queryDraft: "active", authorDraft: "", filters: {} },
      { queryDraft: "", authorDraft: "Ada", filters: {} },
      { queryDraft: "", authorDraft: "", filters: { key: "C" as const } },
      { queryDraft: "", authorDraft: "", filters: { tags: ["pop"] } },
    ]) {
      view.rerender(<SharedPackFilters {...active} {...props} />);
      expect(screen.getByRole("button", { name: "Clear filters" })).toBeEnabled();
    }
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
