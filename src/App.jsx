import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
// Explicit extension on purpose: "WalletContext.jsx" (provider) and "walletContext.js" (context + hook)
// differ only by case/extension, which is ambiguous on case-insensitive file systems (Windows/macOS).
import { WalletProvider } from "./context/WalletContext.jsx";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import EvidenceUpload from "./pages/EvidenceUpload";
import EvidenceViewer from "./pages/EvidenceViewer";
import ChainOfCustody from "./pages/ChainOfCustody";
import CaseManagement from "./pages/CaseManagement";

function NotFound() {
  return (
    <div style={{ color: "#e2e8f0" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>Page not found</h1>
      <p style={{ color: "#94a3b8", marginBottom: "16px" }}>That address does not exist in this demo.</p>
      <Link to="/" style={{ color: "#93c5fd" }}>Back to the dashboard</Link>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/upload" element={<EvidenceUpload />} />
            <Route path="/evidence" element={<EvidenceViewer />} />
            <Route path="/custody" element={<ChainOfCustody />} />
            <Route path="/cases" element={<CaseManagement />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </WalletProvider>
  );
}
