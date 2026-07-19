import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { createDefaultPack } from "../domain/music";
import { toEditablePack } from "../sharing/editablePack";
import type { PublicPack } from "../sharing/types";
import { DeleteSharedPackDialog } from "./DeleteSharedPackDialog";

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value() { this.setAttribute("open", ""); }
  });
});

const local = createDefaultPack();
const target: PublicPack = {
  ...toEditablePack(local),
  id: "00000000-0000-4000-8000-000000000001",
  packName: "Owned Pack",
  authorName: "Ada",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  reportedCount: 0
};
const trigger = createRef<HTMLButtonElement>();
const onCancel = vi.fn();
const onConfirm = vi.fn();

function renderDialog(overrides: Partial<{
  submitting: boolean;
  error: string;
  retryable: boolean;
}> = {}) {
  return render(<DeleteSharedPackDialog
    target={target}
    submitting={overrides.submitting ?? false}
    error={overrides.error ?? ""}
    retryable={overrides.retryable ?? true}
    trigger={trigger}
    onCancel={onCancel}
    onConfirm={onConfirm}
  />);
}

it("opens modally and describes the fixed deletion target", () => {
  renderDialog();

  expect(screen.getByRole("dialog", { name: "Delete shared pack?" })).toHaveAttribute("open");
  expect(screen.getByRole("dialog")).toHaveClass("delete-dialog");
  expect(screen.getByRole("heading", { name: "Delete shared pack?" })).toHaveFocus();
  expect(screen.getByRole("heading", { name: "Delete shared pack?" }).parentElement)
    .toHaveClass("delete-dialog-card");
  expect(screen.getByText("Owned Pack")).toBeInTheDocument();
  expect(screen.getByText("Ada")).toBeInTheDocument();
  expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Delete pack" })).toHaveClass("danger-action");
});

it("cancels from the Cancel button", async () => {
  renderDialog();

  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("cancels from the native dialog cancel event", () => {
  renderDialog();
  const dialog = screen.getByRole("dialog", { name: "Delete shared pack?" });

  fireEvent(dialog, new Event("cancel", { cancelable: true }));

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("cancels from a backdrop click", () => {
  renderDialog();
  const dialog = screen.getByRole("dialog", { name: "Delete shared pack?" });

  fireEvent.click(dialog);

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it("suppresses every close route while submitting", async () => {
  renderDialog({ submitting: true });
  const dialog = screen.getByRole("dialog", { name: "Delete shared pack?" });

  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Deleting…" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Deleting…");
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  fireEvent.click(dialog);
  expect(onCancel).not.toHaveBeenCalled();
});

it("confirms deletion when retry is available", async () => {
  renderDialog({ error: "Try again.", retryable: true });

  await userEvent.click(screen.getByRole("button", { name: "Delete pack" }));

  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("shows only Close for a non-retriable error", () => {
  renderDialog({
    error: "This browser can no longer delete this pack.",
    retryable: false
  });

  expect(screen.getByRole("alert")).toHaveTextContent("This browser can no longer delete this pack.");
  expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Delete pack" })).not.toBeInTheDocument();
});

it("restores focus to a connected trigger when the dialog unmounts", () => {
  const view = renderDialog();

  view.rerender(<button ref={trigger}>Delete trigger</button>);

  expect(trigger.current).toHaveFocus();
});
