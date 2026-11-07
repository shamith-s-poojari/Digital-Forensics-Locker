// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountSwitcher from "./AccountSwitcher";
import { WalletContext } from "../context/walletContext.js";
import { LedgerContext } from "../web3/ledgerContext.js";

const CHIEF = "0xb2396E3Ef3b7eD620c371588183A3d28F7cdd5AE";
const ADMIN = "0x52D0Adf1f32e8CB0eD6345c6EE2A92883d328035";

const ledger = {
  listBranches: async () => [{ id: 1, name: "Central Lab" }],
  getRoles: async (a) => ({ isChief: a === CHIEF, isAdmin: a === ADMIN, isInvestigator: false, isAuditor: false }),
  getIdentity: async (a) => (a === ADMIN ? { role: "admin", branchId: 1 } : { role: null, branchId: 0 }),
};

function renderSwitcher(wallet = {}) {
  const value = {
    account: CHIEF,
    permittedAccounts: [CHIEF],
    selectAccount: vi.fn(async () => {}),
    switchAccount: vi.fn(async () => {}),
    isConnecting: false,
    isSigningIn: false,
    ...wallet,
  };
  render(
    <WalletContext.Provider value={value}>
      <LedgerContext.Provider value={{ ledger, mode: "demo", config: {} }}>
        <AccountSwitcher />
      </LedgerContext.Provider>
    </WalletContext.Provider>
  );
  return value;
}

afterEach(cleanup);

describe("AccountSwitcher", () => {
  it("opens the wallet's picker when no other account is connected yet", async () => {
    const wallet = renderSwitcher();
    await userEvent.click(screen.getByRole("button", { name: /Switch account/ }));
    expect(wallet.switchAccount).toHaveBeenCalledTimes(1);
  });

  it("lists the other connected accounts with their role and branch, and switches to the one picked", async () => {
    const wallet = renderSwitcher({ permittedAccounts: [CHIEF, ADMIN] });
    await userEvent.click(screen.getByRole("button", { name: /Switch account/ }));

    const admin = await screen.findByRole("menuitem", { name: /0x52D0.*8035/ });
    await waitFor(() => expect(admin.textContent).toMatch(/Branch Admin · Central Lab/));
    await userEvent.click(admin);
    expect(wallet.selectAccount).toHaveBeenCalledWith(ADMIN);
    expect(wallet.switchAccount).not.toHaveBeenCalled();
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
