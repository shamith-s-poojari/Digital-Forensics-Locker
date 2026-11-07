// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountSwitcher from "./AccountSwitcher";
import { WalletContext } from "../context/walletContext.js";

const CHIEF = "0xb2396E3Ef3b7eD620c371588183A3d28F7cdd5AE";
const ADMIN = "0x52D0Adf1f32e8CB0eD6345c6EE2A92883d328035";

function renderSwitcher(wallet = {}) {
  const value = {
    account: CHIEF,
    permittedAccounts: [CHIEF],
    switchAccount: vi.fn(async () => {}),
    isConnecting: false,
    isSigningIn: false,
    ...wallet,
  };
  render(
    <WalletContext.Provider value={value}>
      <AccountSwitcher />
    </WalletContext.Provider>
  );
  return value;
}

afterEach(cleanup);

describe("AccountSwitcher", () => {
  it("always goes through the full disconnect-and-reconnect switch, even with other accounts connected", async () => {
    const wallet = renderSwitcher({ permittedAccounts: [CHIEF, ADMIN] });
    await userEvent.click(screen.getByRole("button", { name: /Switch account/ }));
    expect(wallet.switchAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull(); // no in-page shortcut list
  });

  it("does not queue a picker behind an unanswered sign-in message, and says what to do", async () => {
    const wallet = renderSwitcher({ isSigningIn: true });
    expect(screen.queryByRole("status")).toBeNull(); // no note until the user tries

    await userEvent.click(screen.getByRole("button", { name: /Switch account/ }));

    expect(wallet.switchAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/sign the sign-in message/);
  });

  it("explains a long wait: the wallet may be showing an earlier request first", () => {
    renderSwitcher({ isConnecting: true });
    expect(screen.getByRole("button", { name: /Waiting for MetaMask/ })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/answer that one; the account picker comes next/);
  });
});
