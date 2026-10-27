/**
 * Slim, always-visible pre-release notice. Rendered by Layout above the top bar on every page.
 *
 * Colors: #1c1917 text on #fbbf24 background is about 10.5:1 contrast (WCAG AA requires 4.5:1).
 * Not dismissible on purpose. It stays until the roadmap's Phase 5 exit criteria are met (external contract audit,
 * penetration test, no open critical or high findings).
 */
export default function PreReleaseBanner() {
  const style = {
    background: "#fbbf24",
    color: "#1c1917",
    padding: "6px 16px",
    fontSize: "13px",
    lineHeight: 1.4,
    textAlign: "center",
    fontFamily: "'Space Grotesk', sans-serif",
    fontWeight: 500,
    borderBottom: "1px solid #b45309",
  };

  return (
    <div role="note" style={style}>
      <strong style={{ fontWeight: 800, letterSpacing: "0.04em" }}>PRE-RELEASE</strong> {"—"} not audited and not yet
      evidence-grade.
    </div>
  );
}
