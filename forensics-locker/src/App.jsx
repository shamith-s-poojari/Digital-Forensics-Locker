import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WalletProvider } from "./context/WalletContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import EvidenceUpload from "./pages/EvidenceUpload";
import EvidenceViewer from "./pages/EvidenceViewer";
import ChainOfCustody from "./pages/ChainOfCustody";
import CaseManagement from "./pages/CaseManagement";

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
          </Routes>
        </Layout>
      </BrowserRouter>
    </WalletProvider>
  );
}
