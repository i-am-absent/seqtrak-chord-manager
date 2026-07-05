import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import { RecommendationPanel } from "./RecommendationPanel";

describe("RecommendationPanel", () => {
  it("applies a displayed chord after recommendations change", async () => {
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const { rerender } = renderApp(
      <RecommendationPanel
        packKey="C"
        currentChordName="C"
        onPreview={onPreview}
        onApply={onApply}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /^G7/ }));

    rerender(
      <RecommendationPanel
        packKey="D"
        currentChordName="D"
        onPreview={onPreview}
        onApply={onApply}
      />
    );

    expect(screen.getByRole("button", { name: /^Em7/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^1close/ }));
    expect(onApply).toHaveBeenCalledWith(expect.anything(), "Em7");
  });
});
