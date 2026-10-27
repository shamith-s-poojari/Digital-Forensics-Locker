import { BrowserRouter, Navigate, Routes, Route, Link } from "react-router-dom";
// Explicit extension on purpose: "WalletContext.jsx" (provider) and "walletContext.js" (context + hook)
// differ only by case/extension, which is ambiguous on case-insensitive file systems (Windows/macOS).
import { WalletProvider } from "./context/WalletContext.jsx";
import { RoleProvider } from "./context/RoleContext.jsx";
import { useRole } from "./context/roleContext.js";
import { AuthProvider } from "./context/AuthContext.jsx";
import { LedgerProvider } from "./web3/LedgerProvider.jsx";
import { CaseDirectoryProvider } from "./cases/CaseDirectoryProvider.jsx";
import { AccessRequestProvider } from "./access/AccessRequestProvider.jsx";
import { ROUTE_CAPABILITY } from "./web3/roles.js";
import Layout from "./components/Layout";
import RequireCapability from "./components/RequireCapability";
import AdminRoles from "./pages/AdminRoles";
import CaseDashboard from "./pages/CaseDashboard";
import ChainOfCustody from "./pages/ChainOfCustody";
import EvidenceUpload from "./pages/EvidenceUpload";
import EvidenceViewer from "./pages/EvidenceViewer";

function NotFound() {
  return (
    <div style={{ color: "#e2e8f0" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>Page not found</h1>
      <p style={{ color: "#94a3b8", marginBottom: "16px" }}>That address does not exist.</p>
      <Link to="/cases" style={{ color: "#93c5fd" }}>Back to the case dashboard</Link>
    </div>
  );
}

/** A route whose page is only shown to wallets whose role grants the route's capability (see roles.js). */
const guarded = (path, page) => <RequireCapability capability={ROUTE_CAPABILITY[path]}>{page}</RequireCapability>;

/**
 * Routes are guarded in the UI by role. This is a convenience: the contract rejects unauthorised writes and
 * (from Phase 1) the API re-checks roles, so removing a guard never grants access to anything.
 */
function AppRoutes() {
  const { isDemo } = useRole();
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/cases" replace />} />
      <Route path="/cases" element={guarded("/cases", <CaseDashboard />)} />
      <Route path="/upload" element={guarded("/upload", <EvidenceUpload />)} />
      <Route path="/admin" element={guarded("/admin", <AdminRoles />)} />
      {/* These two pages still show sample data, so they exist only in development builds. */}
      {isDemo ? <Route path="/evidence" element={guarded("/evidence", <EvidenceViewer />)} /> : null}
      {isDemo ? <Route path="/custody" element={guarded("/custody", <ChainOfCustody />)} /> : null}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <LedgerProvider>
        <CaseDirectoryProvider>
          <AccessRequestProvider>
            <RoleProvider>
              <AuthProvider>
                <BrowserRouter>
                  <Layout>
                    <AppRoutes />
                  </Layout>
                </BrowserRouter>
              </AuthProvider>
            </RoleProvider>
          </AccessRequestProvider>
        </CaseDirectoryProvider>
      </LedgerProvider>
    </WalletProvider>
  );
}
