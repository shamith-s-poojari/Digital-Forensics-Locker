// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "./Login";
import { AuthContext } from "../context/authContext.js";

const A = "0xE07cAA20fB53Ae4efE7586933507F806a42B2dAe";
const B = "0xDbcAa4b3C55b93691C26c55540Affc69D8d9402f";

function renderLogin(auth = {}) {
  const value = { connect: vi.fn(), chooseAccount: vi.fn(async () => {}), isConnecting: false, error: null, notice: null, accountChoices: null, ...auth };
  render(
    <AuthContext.Provider value={value}>
      <Login />
    </AuthContext.Provider>
  );
  return value;
}

afterEach(cleanup);

describe("Login", () => {
  it("offers Connect when there is nothing to choose", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: /Connect MetaMask/ })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Choose an account" })).toBeNull();
  });

  it("asks which account to use when several were approved together, and signs in as the one picked", async () => {
    const auth = renderLogin({ accountChoices: [A, B], notice: "You connected several accounts. Choose which one to sign in as." });

    const list = screen.getByRole("list", { name: "Choose an account" });
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Connect MetaMask/ })).toBeNull();

    await userEvent.click(buttons[1]);
    expect(auth.chooseAccount).toHaveBeenCalledWith(B);
  });
});
