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
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();

    // Giving the connected wallet the admin role makes it the Chief.
    expect(within(section("Chief")).getByText("you")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Investigators \(\d+\)$/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Auditors (1)" })).toBeTruthy();
    expect(within(section("Auditors (1)")).getByRole("button", { name: `Copy auditor address` })).toBeTruthy();
  });

  it("rejects something that is not an address, without sending anything", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), "not-an-address");
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/valid wallet address/);
    expect(screen.queryByLabelText("Grant Investigator role in Central Lab")).toBeNull();
  });

  it("rejects an address that already holds the role", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), DEMO_AUDITOR);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "auditor");
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/already holds the Auditor role/);
  });

  it("grants a role, narrates the transaction, and shows the new member", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), NEW_ADDRESS);
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));

    const progress = await screen.findByLabelText("Grant Investigator role in Central Lab");
    await waitFor(() => expect(within(progress).getByText(/Included in block/)).toBeTruthy());
    expect(store.roles.get(NEW_ADDRESS.toLowerCase()).isInvestigator).toBe(true);

    await waitFor(() => expect(within(section(/^Investigators/)).getByRole("button", { name: `Revoke investigator role from ${NEW_ADDRESS}` })).toBeTruthy());
    expect(screen.getByLabelText("Wallet address").value).toBe(""); // form is cleared after success
  });

  it("revokes a role only after a second, explicit confirmation", async () => {
    const store = createDemoStore();
    store.setRole(OTHER_INVESTIGATOR, "investigator");
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
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
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
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
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();
    store.roles.set(ACCOUNT.toLowerCase(), { isChief: false, isInvestigator: false, isAuditor: false }); // revoked behind the page's back

    await userEvent.type(screen.getByLabelText("Wallet address"), NEW_ADDRESS);
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));

    const progress = await screen.findByLabelText("Grant Investigator role in Central Lab");
    await waitFor(() => expect(within(progress).getByText(/not authorised for this action/)).toBeTruthy());
    expect(store.roles.has(NEW_ADDRESS.toLowerCase())).toBe(false);
  });
});

describe("AdminRoles: access requests", () => {
  const REQUESTER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

  async function withRequest(role = "auditor") {
    const store = createDemoStore();
    const requests = createDemoAccessRequestStore();
    await requests.submit({ role, branchId: 1, reason: "Internal audit team" }, REQUESTER);
    renderWithDemo(
      <AccessRequestProvider store={requests}>
        <AdminRoles />
      </AccessRequestProvider>,
      { store, role: "chief" }
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

describe("AdminRoles: the Admin role", () => {
  const REQUESTER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";

  it("lets an Admin manage Investigators and Auditors but not appoint or remove Admins", async () => {
    const store = createDemoStore();
    store.setRole(REQUESTER, "admin"); // another Admin
    renderWithDemo(<AdminRoles />, { store, role: "admin" });
    await loaded();

    const options = within(screen.getByLabelText("Role")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Investigator", "Auditor"]);
    expect(screen.queryByRole("button", { name: `Revoke admin role from ${REQUESTER}` })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Revoke investigator role/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Pause ledger/ })).toBeTruthy();
  });

  it("lets the Chief appoint an Admin", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();

    await userEvent.type(screen.getByLabelText("Wallet address"), REQUESTER);
    await userEvent.selectOptions(screen.getByLabelText("Role"), "admin");
    await userEvent.click(screen.getByRole("button", { name: "Grant role" }));

    await waitFor(() => expect(within(section("Branch Admins (1)")).getByText(REQUESTER, { exact: false })).toBeTruthy());
    expect(screen.getByRole("button", { name: `Revoke admin role from ${REQUESTER}` })).toBeTruthy();
  });

  it("sends Branch Admin requests to the Chief alone", async () => {
    const requests = createDemoAccessRequestStore();
    await requests.submit({ role: "admin", branchId: 1, reason: "Deputy for the lab" }, REQUESTER);
    renderWithDemo(
      <AccessRequestProvider store={requests}>
        <AdminRoles />
      </AccessRequestProvider>,
      { store: createDemoStore(), role: "admin" }
    );
    await loaded();
    expect(await screen.findByRole("heading", { name: "Access requests (0)" })).toBeTruthy();
    expect(screen.queryByText("Deputy for the lab")).toBeNull();
  });
});

describe("AdminRoles: branches", () => {
  const SOUTH_REQUESTER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
  const NORTH_REQUESTER = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";
  const NORTH_INVESTIGATOR = "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f";

  async function withBranchRequests(role) {
    const store = createDemoStore();
    store.setRole(NORTH_INVESTIGATOR, "investigator", 2);
    const requests = createDemoAccessRequestStore();
    await requests.submit({ role: "auditor", branchId: 1, reason: "Central audit" }, SOUTH_REQUESTER);
    await requests.submit({ role: "investigator", branchId: 2, reason: "North cyber unit" }, NORTH_REQUESTER);
    renderWithDemo(
      <AccessRequestProvider store={requests}>
        <AdminRoles />
      </AccessRequestProvider>,
      { store, role }
    );
    await loaded();
    return { store, requests };
  }

  it("shows a Branch Admin only its own branch's requests and members, and grants only there", async () => {
    await withBranchRequests("admin");
    await screen.findByText("Central audit");
    expect(screen.queryByText("North cyber unit")).toBeNull();
    expect(screen.queryByRole("button", { name: `Revoke investigator role from ${NORTH_INVESTIGATOR}` })).toBeNull();

    const branch = screen.getByLabelText("Branch");
    expect(branch.disabled).toBe(true);
    expect(within(branch).getAllByRole("option").map((o) => o.textContent)).toEqual(["Central Lab"]);
    expect(screen.queryByRole("heading", { name: /^Branches/ })).toBeNull(); // the Chief creates branches
  });

  it("gives the Chief every branch, and approves a request in the branch it names", async () => {
    const { store } = await withBranchRequests("chief");
    await screen.findByText("North cyber unit");
    expect(screen.getByText("Central audit")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Revoke investigator role from ${NORTH_INVESTIGATOR}` })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: `Approve Investigator for ${NORTH_REQUESTER}` }));
    await waitFor(() => expect(store.identity.get(NORTH_REQUESTER.toLowerCase())).toEqual({ role: "investigator", branchId: 2 }));
  });

  it("lets the Chief create a branch", async () => {
    const store = createDemoStore();
    renderWithDemo(<AdminRoles />, { store, role: "chief" });
    await loaded();

    await userEvent.type(screen.getByLabelText("New branch name"), "South Regional Lab");
    await userEvent.click(screen.getByRole("button", { name: "Create branch" }));
    await waitFor(() => expect(store.branches.at(-1)).toEqual({ id: 3, name: "South Regional Lab" }));
    expect(await screen.findByRole("heading", { name: "Branches (3)" })).toBeTruthy();
  });
});
