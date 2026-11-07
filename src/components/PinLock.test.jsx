// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PinLock from "./PinLock";
import { WalletContext } from "../context/walletContext.js";

const ADDRESS = "0xE07cAA20fB53Ae4efE7586933507F806a42B2dAe";

function renderLock(pinPrompt) {
  const value = { pinPrompt, submitPin: vi.fn(), cancelPin: vi.fn() };
  render(
    <WalletContext.Provider value={value}>
      <PinLock />
    </WalletContext.Provider>
  );
  return value;
}

afterEach(cleanup);

describe("PinLock", () => {
  it("shows nothing when no PIN is asked for", () => {
    renderLock(null);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("covers the page and unlocks with the PIN typed (digits only)", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: null });
    expect(screen.getByRole("dialog", { name: "Locked" })).toBeTruthy();

    await userEvent.type(screen.getByLabelText("PIN"), "12a34");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(wallet.submitPin).toHaveBeenCalledWith("1234");
  });

  it("refuses a too-short PIN without submitting, and shows the server's error", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: "wrong PIN. 4 attempts left." });
    expect(screen.getByRole("alert").textContent).toMatch(/wrong PIN/);

    await userEvent.type(screen.getByLabelText("PIN"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(wallet.submitPin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/4 to 8 digits/);
  });

  it("asks for the new PIN twice when creating one", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "create", error: null });
    expect(screen.getByRole("dialog", { name: "Set a PIN for this account" })).toBeTruthy();

    await userEvent.type(screen.getByLabelText("New PIN"), "2468");
    await userEvent.type(screen.getByLabelText("Repeat PIN"), "2469");
    await userEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(wallet.submitPin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/do not match/);

    await userEvent.clear(screen.getByLabelText("Repeat PIN"));
    await userEvent.type(screen.getByLabelText("Repeat PIN"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(wallet.submitPin).toHaveBeenCalledWith("2468");
  });

  it("cancels with the button or Escape", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: null });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.keyboard("{Escape}");
    expect(wallet.cancelPin).toHaveBeenCalledTimes(2);
  });
});
