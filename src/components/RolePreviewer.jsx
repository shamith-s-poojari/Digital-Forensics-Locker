import { FlaskConical } from "lucide-react";
import { useRole } from "../context/roleContext.js";
import { ROLE_LABELS, ROLES } from "../web3/roles.js";

/**
 * Development-only control: pretend the connected wallet holds a given role, to see each role's interface.
 * Renders nothing unless the app is running on the in-memory demo ledger. It lives in the layout (not in a page) so
 * it stays reachable even when the chosen role is denied the page you were on.
 */
export default function RolePreviewer() {
  const { isDemo, role, setPreviewRole } = useRole();
  if (!isDemo) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "8px",
        padding: "6px 16px",
        background: "#1e293b",
        borderBottom: "1px dashed #475569",
        color: "#e2e8f0",
        fontSize: "13px",
      }}
    >
      <FlaskConical size={14} color="#fcd34d" aria-hidden="true" focusable="false" />
      <label htmlFor="preview-role">Development preview: view the app as</label>
      <select
        id="preview-role"
        value={role}
        onChange={(e) => setPreviewRole(e.target.value)}
        style={{ background: "#0f172a", color: "#f1f5f9", border: "1px solid #475569", borderRadius: "4px", padding: "2px 6px", fontSize: "13px" }}
      >
        {Object.values(ROLES).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </div>
  );
}
