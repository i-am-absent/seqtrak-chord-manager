import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { renderApp } from "./test/render";

describe("App", () => {
  it("renders the local editor and changes selected chord notes", async () => {
    renderApp(<App />);

    expect(screen.getByRole("heading", { name: "Chord Manager" })).toBeInTheDocument();
    expect(screen.getByLabelText("Pack metadata")).toBeInTheDocument();
    expect(screen.getByLabelText("Chord slots")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Slot 2 Dm" }));
    await userEvent.click(screen.getByRole("button", { name: "C4" }));

    expect(screen.getByRole("button", { name: "C4" })).toHaveAttribute("aria-pressed", "true");
  });
});
