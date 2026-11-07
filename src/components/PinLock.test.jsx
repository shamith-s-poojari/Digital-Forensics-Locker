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

  it("covers the page and unlocks with the password typed, letters and symbols included", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: null });
    expect(screen.getByRole("dialog", { name: "Locked" })).toBeTruthy();

    await userEvent.type(screen.getByLabelText("Password"), "Ev1dence!#");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(wallet.submitPin).toHaveBeenCalledWith("Ev1dence!#");
  });

  it("still unlocks with a numeric PIN set before passwords were required", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: null });
    await userEvent.type(screen.getByLabelText("Password"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(wallet.submitPin).toHaveBeenCalledWith("1234");
  });

  it("refuses an empty password without submitting, and shows the server's error", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: "wrong password. 4 attempts left." });
    expect(screen.getByRole("alert").textContent).toMatch(/wrong password/);

    await userEvent.click(screen.getByRole("button", { name: "Unlock" }));

    expect(wallet.submitPin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Enter the password/);
  });

  it("shows and hides the password", async () => {
    renderLock({ address: ADDRESS, mode: "enter", error: null });
    const input = screen.getByLabelText("Password");
    expect(input.getAttribute("type")).toBe("password");
    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.getAttribute("type")).toBe("text");
    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.getAttribute("type")).toBe("password");
  });

  it("refuses a weak new password", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "create", error: null });
    for (const weak of ["12345678", "abcd1234", "Ab1!"]) {
      await userEvent.clear(screen.getByLabelText("New password"));
      await userEvent.clear(screen.getByLabelText("Repeat password"));
      await userEvent.type(screen.getByLabelText("New password"), weak);
      await userEvent.type(screen.getByLabelText("Repeat password"), weak);
      await userEvent.click(screen.getByRole("button", { name: "Save password" }));
      expect(screen.getByRole("alert").textContent).toMatch(/one letter, one number and one symbol/);
    }
    expect(wallet.submitPin).not.toHaveBeenCalled();
  });

  it("asks for the new password twice when creating one", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "create", error: null });
    expect(screen.getByRole("dialog", { name: "Set a password for this account" })).toBeTruthy();

    await userEvent.type(screen.getByLabelText("New password"), "Ev1dence!");
    await userEvent.type(screen.getByLabelText("Repeat password"), "Ev1dence?");
    await userEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(wallet.submitPin).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/do not match/);

    await userEvent.clear(screen.getByLabelText("Repeat password"));
    await userEvent.type(screen.getByLabelText("Repeat password"), "Ev1dence!");
    await userEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(wallet.submitPin).toHaveBeenCalledWith("Ev1dence!");
  });

  it("cancels with the button or Escape", async () => {
    const wallet = renderLock({ address: ADDRESS, mode: "enter", error: null });
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.keyboard("{Escape}");
    expect(wallet.cancelPin).toHaveBeenCalledTimes(2);
  });
});
