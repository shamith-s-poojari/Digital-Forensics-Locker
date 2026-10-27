// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import Layout from "./Layout";
import Pagination from "./Pagination";
import StatusBadge from "./StatusBadge";
import { WalletProvider } from "../context/WalletContext.jsx";
import { useWallet } from "../context/walletContext.js";
import { AuthProvider } from "../context/AuthContext.jsx";
import { RoleTestProvider } from "../test/RoleTestProvider.jsx";

const decodeEntities = (html) => html.replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

describe("StatusBadge", () => {
  const cases = [
    ["Verified", "Evidence status"],
    ["Pending", "Evidence status"],
    ["Flagged", "Evidence status"],
    ["Active", "Case status"],
    ["Under Review", "Case status"],
    ["Closed", "Case status"],
    ["Submit", "Event type"],
    ["Access", "Event type"],
    ["Verify", "Event type"],
  ];

  it.each(cases)("renders %s with a text label and a hidden %s prefix", (status, kind) => {
    const html = renderToStaticMarkup(<StatusBadge status={status} />);
    expect(html).toContain(`<span>${status}</span>`);
    expect(html).toContain(`${kind}: `);
  });

  it("falls back to a neutral style for unknown labels and still shows the text", () => {
    const html = renderToStaticMarkup(<StatusBadge status="Whatever" />);
    expect(html).toContain("<span>Whatever</span>");
    expect(html).toContain("Status: ");
  });

  it("supports sizes and defaults to md", () => {
    expect(renderToStaticMarkup(<StatusBadge status="Active" />)).toContain("font-size:11px");
    expect(renderToStaticMarkup(<StatusBadge status="Active" size="sm" />)).toContain("font-size:10px");
    expect(renderToStaticMarkup(<StatusBadge status="Active" size="lg" />)).toContain("font-size:12px");
    expect(renderToStaticMarkup(<StatusBadge status="Active" size="nope" />)).toContain("font-size:11px");
  });
});

describe("Pagination", () => {
  const render = (props) =>
    renderToStaticMarkup(
      <Pagination page={1} totalPages={3} onPageChange={() => {}} showingFrom={1} showingTo={10} totalItems={25} {...props} />
    );

  it("renders an accessible nav with a summary", () => {
    const html = render();
    expect(html).toContain('<nav aria-label="Pagination"');
    expect(html.replace(/<[^>]+>/g, "")).toContain("Showing 1–10 of 25");
    expect(html).toContain('aria-label="Previous page"');
    expect(html).toContain('aria-label="Next page"');
  });

  it("disables Previous on the first page and Next on the last", () => {
    const first = render({ page: 1 });
    expect(first).toMatch(/<button[^>]*aria-label="Previous page"[^>]*disabled=""/);
    expect(first).not.toMatch(/<button[^>]*aria-label="Next page"[^>]*disabled=""/);

    const last = render({ page: 3, showingFrom: 21, showingTo: 25 });
    expect(last).not.toMatch(/<button[^>]*aria-label="Previous page"[^>]*disabled=""/);
    expect(last).toMatch(/<button[^>]*aria-label="Next page"[^>]*disabled=""/);
  });

  it("renders nothing when there are no items", () => {
    expect(render({ totalItems: 0, showingFrom: 0, showingTo: 0, totalPages: 1 })).toBe("");
  });
});

describe("useWallet / WalletProvider", () => {
  function Probe() {
    const { account, error, isConnecting } = useWallet();
    return <p>{`account=${account};error=${error};connecting=${isConnecting}`}</p>;
  }

  it("throws a clear error outside a provider", () => {
    expect(() => renderToStaticMarkup(<Probe />)).toThrow(/within a <WalletProvider>/);
  });

  it("starts disconnected without an error inside a provider", () => {
    const html = renderToStaticMarkup(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    expect(html).toContain("account=null;error=null;connecting=false");
  });
});

describe("Layout (no wallet connected)", () => {
  const html = decodeEntities(
    renderToStaticMarkup(
      <MemoryRouter>
        <WalletProvider>
          <RoleTestProvider status="disconnected">
            <AuthProvider>
              <Layout>
                <div>SECRET-PAGE-CONTENT</div>
              </Layout>
            </AuthProvider>
          </RoleTestProvider>
        </WalletProvider>
      </MemoryRouter>
    )
  );

  it("gates children behind the wallet", () => {
    expect(html).not.toContain("SECRET-PAGE-CONTENT");
  });

  it("does not claim secure verification and says a wallet is not authorization", () => {
    expect(html).not.toMatch(/secure chain-of-custody verification/i);
    expect(html).not.toMatch(/demo/i);
    expect(html).toMatch(/not authorization/i);
  });
});
