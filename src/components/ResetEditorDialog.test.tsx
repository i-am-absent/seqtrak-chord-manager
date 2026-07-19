import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ResetEditorDialog } from "./ResetEditorDialog";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() { this.setAttribute("open", ""); }
  });
});

function setup() {
  const trigger = createRef<HTMLButtonElement>();
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  const view = render(<>
    <button ref={trigger}>Reset trigger</button>
    <ResetEditorDialog trigger={trigger} onCancel={onCancel} onConfirm={onConfirm} />
  </>);
  return { ...view, trigger, onCancel, onConfirm };
}

it("opens a labelled modal, explains preserved device state, and focuses the heading", () => {
  setup();
  expect(screen.getByRole("dialog", { name: "Reset editor?" })).toHaveAttribute("open");
  expect(screen.getByRole("dialog")).toHaveClass("reset-dialog");
  expect(screen.getByRole("heading", { name: "Reset editor?" }).parentElement)
    .toHaveClass("reset-dialog-card");
  expect(screen.getByRole("button", { name: "Reset editor" })).toHaveClass("danger-action");
  expect(screen.getByRole("heading", { name: "Reset editor?" })).toHaveFocus();
  expect(screen.getByText(
    "This replaces the current pack with the default pack and clears SCALE. Your MIDI connection and SEQTRAK KEY will be preserved."
  )).toBeInTheDocument();
});

it("cancels from the button, Escape, and backdrop", async () => {
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

it("confirms only from Reset editor", async () => {
  const { onConfirm, onCancel } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Reset editor" }));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();
});

it("restores focus to a connected trigger on unmount", () => {
  const view = setup();
  view.rerender(<button ref={view.trigger}>Reset trigger</button>);
  expect(view.trigger.current).toHaveFocus();
});
