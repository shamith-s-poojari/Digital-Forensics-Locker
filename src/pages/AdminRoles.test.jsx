// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACCOUNT, OTHER_INVESTIGATOR, renderWithDemo } from "../test/demoHarness.jsx";
import { createDemoStore, DEMO_AUDITOR } from "../web3/demoLedger.js";
import AdminRoles from "./AdminRoles";
import { AccessRequestProvider } from "../access/AccessRequestProvider.jsx";
import { createDemoAccessRequestStore } from "../access/accessRequestStores.js";

const NEW_ADDRESS = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";

afterEach(cleanup);

const section = (name) => screen.getByRole("heading", { name }).closest("section");
const loaded = () => screen.findByRole("heading", { name: "Chief" });

describe("AdminRoles", () => {
  it("lists the Chief and everyone holding a working role", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    // Giving the connected wallet the admin role makes it the Chief.
    expect(within(section("Chief")).getByText("you")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Investigators \(\d+\)$/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Auditors (1)" })).toBeTruthy();
    expect(within(section("Auditors (1)")).getByRole("button", { name: `Copy auditor address` })).toBeTruthy();
  });

  it("rejects something that is not an address, without sending anything", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), "not-an-address");
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/valid wallet address/);
    expect(screen.queryByLabelText("Grant Investigator role")).toBeNull();
  });

  it("rejects an address that already holds the role", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), DEMO_AUDITOR);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "auditor");
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already an Auditor/);
  });

  it("grants a role, narrates the transaction, and shows the new member", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), NEW_ADDRESS);
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));

    const progress = await screen.findByLabelText("Grant Investigator role");
    await waitFor(() => expect(within(progress).getByText(/Included in block/)).toBeTruthy());
    expect(store.roles.get(NEW_ADDRESS.toLowerCase()).isInvestigator).toBe(true);

    await waitFor(() => expect(within(section(/^Investigators/)).getByRole("button", { name: `Revoke investigator role from ${NEW_ADDRESS}` })).toBeTruthy());
    expect(screen.getByLabelText("Wallet address").value).toBe(""); // form is cleared after success
  });

  it("revokes a role only after a second, explicit confirmation", async () => {
    const store = createDemoStore();
    store.setRole(OTHER_INVESTIGATOR, "investigator");
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: `Revoke investigator role from ${OTHER_INVESTIGATOR}` }));
    // Cancel: nothing happens.
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.roles.get(OTHER_INVESTIGATOR.toLowerCase()).isInvestigator).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: `Revoke investigator role from ${OTHER_INVESTIGATOR}` }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await screen.findByText(/Included in block/);
    expect(store.roles.get(OTHER_INVESTIGATOR.toLowerCase()).isInvestigator).toBe(false);
    await waitFor(() => expect(screen.queryByRole("button", { name: `Revoke investigator role from ${OTHER_INVESTIGATOR}` })).toBeNull());
  });

  it("pauses and resumes the ledger", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    await userEvent.click(screen.getByRole("button", { name: "Pause ledger" }));
    await screen.findByText(/Included in block/);
    expect(store.paused).toBe(true);
    expect(await screen.findByRole("button", { name: "Resume ledger" })).toBeTruthy();
    expect(screen.getByText(/Evidence writes are paused for everyone/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Resume ledger" }));
    await waitFor(() => expect(store.paused).toBe(false));
  });

  it("shows the refusal when the ledger rejects the change (the role was removed meanwhile)", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();
    store.roles.set(ACCOUNT.toLowerCase(), { isAdmin: false, isInvestigator: false, isAuditor: false }); // revoked behind the page's back

    await userEvent.type(screen.getByLabelText("Wallet address"), NEW_ADDRESS);
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));

    const progress = await screen.findByLabelText("Grant Investigator role");
    await waitFor(() => expect(within(progress).getByText(/not authorised for this action/)).toBeTruthy());
    expect(store.roles.has(NEW_ADDRESS.toLowerCase())).toBe(false);
  });
});

describe("AdminRoles: access requests", () => {
  const REQUESTER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

  async function withRequest(role = "auditor") {
    const store = createDemoStore();
    const requests = createDemoAccessRequestStore();
    await requests.submit({ role, reason: "Internal audit team" }, REQUESTER);
    renderWithDemo(
      <AccessRequestProvider store={requests}>
        <AdminRoles />
      </AccessRequestProvider>,
      { store, role: "admin" }
    );
    await loaded();
    await screen.findByText("Internal audit team");
    return { store, requests };
  }

  it("approving grants the requested role on the ledger, then clears the request", async () => {
    const { requests } = await withRequest("auditor");
    expect(screen.getByRole("heading", { name: "Access requests (1)" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: `Approve Auditor for ${REQUESTER}` }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Access requests (0)" })).toBeTruthy());
    expect(within(section("Auditors (2)")).getByText(REQUESTER, { exact: false })).toBeTruthy();
    expect((await requests.mine(REQUESTER)).status).toBe("approved");
  });

  it("rejecting records the decision and grants nothing", async () => {
    const { requests } = await withRequest("investigator");

    await userEvent.click(screen.getByRole("button", { name: `Reject request from ${REQUESTER}` }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Access requests (0)" })).toBeTruthy());
    expect(screen.queryByText(REQUESTER, { exact: false })).toBeNull();
    expect((await requests.mine(REQUESTER)).status).toBe("rejected");
  });
});
