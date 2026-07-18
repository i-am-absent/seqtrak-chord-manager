import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { toEditablePack } from "../sharing/editablePack";
import { PublishPackDialog } from "./PublishPackDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() { this.setAttribute("open", ""); }
  });
});

function setup(submitting = false, error = "") {
  const snapshot = toEditablePack({
    ...createDefaultPack(), packName: "Publish Me", authorName: "Ada",
    tags: ["pop", "bright"], key: "D", trackSoundName: "Warm Pad"
  });
  const trigger = createRef<HTMLButtonElement>();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = render(<>
    <button ref={trigger}>Publish trigger</button>
    <PublishPackDialog snapshot={snapshot} submitting={submitting} error={error}
      trigger={trigger} onCancel={onCancel} onConfirm={onConfirm} />
  </>);
  return { ...view, onCancel, onConfirm, trigger };
}

it("shows the fixed snapshot and focuses a labelled modal", () => {
  setup();
  expect(screen.getByRole("dialog", { name: "Publish shared pack" })).toHaveAttribute("open");
  expect(screen.getByRole("dialog")).toHaveClass("publish-dialog");
  expect(screen.getByRole("heading", { name: "Publish shared pack" }).parentElement)
    .toHaveClass("publish-dialog-card");
  expect(screen.getByRole("heading", { name: "Publish shared pack" })).toHaveFocus();
  for (const text of ["Publish Me", "Ada", "KEY D", "Warm Pad", "pop, bright"]) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  for (const chord of createDefaultPack().chords) {
    expect(screen.getByText(chord.displayName)).toBeInTheDocument();
  }
  expect(screen.getByText(/independent snapshot/i)).toBeInTheDocument();
});

it("cancels by button, Escape, and backdrop", async () => {
  const button = setup();
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(button.onCancel).toHaveBeenCalledTimes(1);
  button.unmount();
  const escape = setup();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(escape.onCancel).toHaveBeenCalledTimes(1);
  escape.unmount();
  const backdrop = setup();
  fireEvent.click(screen.getByRole("dialog"));
  expect(backdrop.onCancel).toHaveBeenCalledTimes(1);
});

it("blocks close while submitting and announces progress", () => {
  const { onCancel } = setup(true);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Publishing…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Publishing…");
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  fireEvent.click(screen.getByRole("dialog"));
  expect(onCancel).not.toHaveBeenCalled();
});

it("shows an error alert and restores trigger focus on unmount", () => {
  const view = setup(false, "Sharing is unavailable.");
  expect(screen.getByRole("alert")).toHaveTextContent("Sharing is unavailable.");
  view.rerender(<button ref={view.trigger}>Publish trigger</button>);
  expect(view.trigger.current).toHaveFocus();
});
