// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

const ACCOUNT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function installWallet(account = ACCOUNT) {
  const handlers = {};
  let selected = account;
  window.ethereum = {
    request: vi.fn(async ({ method }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [selected];
      if (method === "eth_chainId") return "0xaa36a7";
      return null;
    }),
    on: vi.fn((event, handler) => {
      handlers[event] = handler;
    }),
    removeListener: vi.fn(),
    /** Test helper: the user picks another account in MetaMask. */
    switchTo(next) {
      selected = next;
      act(() => handlers.accountsChanged?.([next]));
    },
  };
}

function goTo(path) {
  act(() => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

async function connect() {
  await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);
  await screen.findByRole("navigation", { name: "Main" });
}

const navNames = () => within(screen.getByRole("navigation", { name: "Main" })).queryAllByRole("link").map((a) => a.textContent);

// Real wallets authorised on the demo ledger through .env, the way a developer sets it up.
const CHIEF = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const AUDITOR = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const STRANGER = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc";
const ADMIN = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";

beforeEach(() => {
  window.history.pushState({}, "", "/");
  vi.stubEnv("VITE_DEMO_CHIEF", CHIEF);
  vi.stubEnv("VITE_DEMO_ADMINS", ADMIN);
  vi.stubEnv("VITE_DEMO_INVESTIGATORS", ACCOUNT);
  vi.stubEnv("VITE_DEMO_AUDITORS", AUDITOR);
  installWallet();
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.ethereum;
});

describe("App: wallet gate and routing by role (development build, demo ledger)", () => {
  it("denies a wallet that holds no role on the ledger, and shows nothing behind the gate", async () => {
    installWallet(STRANGER);
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);

    expect(await screen.findByRole("heading", { name: "Access Denied: Address not registered" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Case Management" })).toBeNull();
    expect(screen.getByRole("form", { name: "Request access" })).toBeTruthy();
  });

  // Approving (a ledger write, which needs the sign-in server) is covered in AdminRoles.test.jsx.
  it("lets a denied wallet request a role, and shows the request to the Chief", async () => {
    installWallet(STRANGER);
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);
    await screen.findByRole("heading", { name: "Access Denied: Address not registered" });

    await userEvent.selectOptions(screen.getByLabelText("Role you need"), "auditor");
    await waitFor(() => expect(within(screen.getByLabelText("Branch location")).getByRole("option", { name: "Central Lab" })).toBeTruthy());
    await userEvent.selectOptions(screen.getByLabelText("Branch location"), "Central Lab");
    await userEvent.type(screen.getByLabelText("Reason (optional)"), "Internal audit team");
    await userEvent.click(screen.getByRole("button", { name: "Request access" }));
    expect(await screen.findByText(/Waiting for the branch's Admin or the Chief/)).toBeTruthy();
    expect(screen.getByText("Central Lab")).toBeTruthy();

    // The Chief switches MetaMask to their account and finds the request waiting.
    window.ethereum.switchTo(CHIEF);
    await screen.findByText("Chief", { selector: "[data-role]" });
    expect(await screen.findByText("pending access requests")).toBeTruthy(); // sidebar count on Role Management
    goTo("/admin");
    expect(await screen.findByText("Internal audit team")).toBeTruthy();
    expect(screen.getByRole("button", { name: `Approve Auditor for ${STRANGER}` })).toBeTruthy();
  });

  it("lets the first wallet claim the Chief role when none is configured (demo only)", async () => {
    vi.stubEnv("VITE_DEMO_CHIEF", "");
    installWallet(STRANGER);
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Make this wallet the Chief" }));
    expect(await screen.findByText("Chief", { selector: "[data-role]" })).toBeTruthy();
  });

  it("does not offer to claim the Chief role when one is configured", async () => {
    installWallet(STRANGER);
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);
    await screen.findByRole("heading", { name: "Access Denied: Address not registered" });
    expect(screen.queryByRole("button", { name: "Make this wallet the Chief" })).toBeNull();
  });

  it("never makes a wallet an Investigator just for connecting", async () => {
    vi.stubEnv("VITE_DEMO_INVESTIGATORS", "");
    render(<App />);
    await userEvent.click(screen.getAllByRole("button", { name: /Connect/ })[0]);
    expect(await screen.findByRole("heading", { name: "Access Denied: Address not registered" })).toBeTruthy();
  });

  it("shows each configured role in the header badge", async () => {
    installWallet(CHIEF);
    render(<App />);
    await connect();
    expect(await screen.findByText("Chief", { selector: "[data-role]" })).toBeTruthy();
  });

  it("shows nothing but the connect screen until a wallet is connected", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Sign in to the evidence ledger" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "How sign-in works" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Case Management" })).toBeNull();
  });

  it("sends / to the role's own dashboard once connected", async () => {
    render(<App />);
    await connect();
    expect(await screen.findByRole("heading", { level: 1, name: "Investigator workbench" })).toBeTruthy();
    expect(window.location.pathname).toBe("/home");
  });

  it.each([
    ["the Chief", CHIEF, "Chief's overview", ["Team", "Access requests (0)"]],
    ["an Admin", ADMIN, "Admin workspace", ["Officers", "Access requests (0)"]],
    ["an Investigator", ACCOUNT, "Investigator workbench", [/^In my custody/, "Handed to me this week"]],
    ["an Auditor", AUDITOR, "Audit view", [/^Exceptions to review/, "Activity log"]],
  ])("gives %s their own dashboard", async (_who, wallet, title, panels) => {
    installWallet(wallet);
    render(<App />);
    await connect();
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeTruthy();
    for (const panel of panels) expect(await screen.findByRole("heading", { level: 2, name: panel })).toBeTruthy();
  });

  it("shows read-only dashboards no write shortcuts, and Investigators theirs", async () => {
    installWallet(AUDITOR);
    render(<App />);
    await connect();
    await screen.findByRole("heading", { level: 1, name: "Audit view" });
    expect(screen.queryByRole("link", { name: "Register evidence" })).toBeNull();
    cleanup();

    installWallet(ACCOUNT);
    render(<App />);
    await connect();
    await screen.findByRole("heading", { level: 1, name: "Investigator workbench" });
    expect(screen.getByRole("link", { name: "Register evidence" }).getAttribute("href")).toBe("/upload");
  });

  it("opens the case dashboard on the item a dashboard row links to", async () => {
    installWallet(AUDITOR);
    render(<App />);
    await connect();
    await screen.findByRole("heading", { level: 1, name: "Audit view" });
    const log = screen.getByRole("heading", { level: 2, name: "Activity log" }).closest("section");
    const firstItem = within(log).getAllByRole("link").find((a) => a.getAttribute("href")?.startsWith("/cases?case="));
    const id = firstItem.textContent.match(/Evidence #(\d+)/)[1];
    await userEvent.click(firstItem);
    expect(await screen.findByRole("heading", { name: "Case Management" })).toBeTruthy();
    expect(window.location.search).toContain(`evidence=${id}`);
  });

  it("keeps a deep link instead of redirecting to the landing page", async () => {
    installWallet(CHIEF);
    goTo("/cases");
    render(<App />);
    await connect();
    expect(await screen.findByRole("heading", { name: "Case Management" })).toBeTruthy();
    expect(window.location.pathname).toBe("/cases");
  });

  it("gives an Investigator the upload page and its link", async () => {
    render(<App />);
    await connect();
    await screen.findByRole("heading", { level: 1, name: "Investigator workbench" });
    expect(navNames()).toContain("Evidence Upload");

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Register Evidence" })).toBeTruthy();
  });

  it("shows the role read from the ledger next to the wallet address, and no development role picker", async () => {
    render(<App />);
    await connect();
    expect(await screen.findByText("Investigator", { selector: "[data-role]" })).toBeTruthy();
    expect(screen.queryByLabelText(/view the app as/)).toBeNull();
  });

  it("keeps an Auditor out of the upload page and removes its link", async () => {
    installWallet(AUDITOR);
    render(<App />);
    await connect();
    await waitFor(() => expect(navNames()).toEqual(["Dashboard", "Case Management", "Evidence Viewer", "Chain of Custody"]));

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Register Evidence" })).toBeNull();
  });

  it("keeps the Chief out of evidence upload but lets them manage roles", async () => {
    installWallet(CHIEF);
    render(<App />);
    await connect();
    await waitFor(() => expect(navNames()).toContain("Role Management"));
    expect(navNames()).not.toContain("Evidence Upload");

    goTo("/upload");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();

    goTo("/admin");
    expect(await screen.findByRole("heading", { name: "Role Management" })).toBeTruthy();
  });

  it("keeps an Investigator out of role management", async () => {
    render(<App />);
    await connect();
    await screen.findByRole("heading", { level: 1, name: "Investigator workbench" });
    goTo("/admin");
    expect(await screen.findByRole("heading", { name: "Not authorised" })).toBeTruthy();
    expect(screen.getByText(/Required: Chief or Branch Admin/)).toBeTruthy();
  });

  it("shows a 404 for unknown pages", async () => {
    render(<App />);
    await connect();
    goTo("/definitely-not-a-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
