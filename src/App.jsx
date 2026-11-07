import { lazy, Suspense } from "react";
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
import { landingRoute, ROUTE_CAPABILITY } from "./web3/roles.js";
import Layout from "./components/Layout";
import RequireCapability from "./components/RequireCapability";
import { Spinner } from "./components/ui";

// Each page is its own chunk, downloaded the first time its route is opened, so the sign-in screen stays small.
const AdminRoles = lazy(() => import("./pages/AdminRoles"));
const CaseDashboard = lazy(() => import("./pages/CaseDashboard"));
const ChainOfCustody = lazy(() => import("./pages/ChainOfCustody"));
const EvidenceUpload = lazy(() => import("./pages/EvidenceUpload"));
const EvidenceViewer = lazy(() => import("./pages/EvidenceViewer"));
const RoleHome = lazy(() => import("./pages/RoleHome"));

function NotFound() {
  return (
    <div style={{ color: "var(--color-slate-200)" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>Page not found</h1>
      <p style={{ color: "var(--color-slate-400)", marginBottom: "16px" }}>That address does not exist.</p>
      <Link to="/cases" style={{ color: "var(--color-slate-100)" }}>Back to the case dashboard</Link>
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
  const { isDemo, roles } = useRole();
  return (
    <Routes>
      {/* Layout only renders the routes once the gate is "granted", so `roles` here are the ones read from the contract. */}
      <Route path="/" element={<Navigate to={landingRoute(roles) ?? "/cases"} replace />} />
      <Route path="/home" element={guarded("/home", <RoleHome />)} />
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
                    <Suspense fallback={<Spinner label="Loading page…" />}>
                      <AppRoutes />
                    </Suspense>
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
