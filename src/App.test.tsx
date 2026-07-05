import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import App from "./App";
import { renderApp } from "./test/render";

test("renders the initial chord manager shell", () => {
  renderApp(<App />);

  expect(screen.getByText("SEQTRAK")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Chord Manager" })).toBeTruthy();
  expect(screen.getByText("Browser-only mode")).toBeTruthy();
  expect(screen.getByText("Editor loading...")).toBeTruthy();
});
