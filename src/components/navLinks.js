import { FolderOpen, GitBranch, Search, ShieldCheck, Upload } from "lucide-react";
import { useRole } from "../context/roleContext.js";
import { ROUTE_CAPABILITY } from "../web3/roles.js";

/** Every possible link. `demoOnly` links point at pages that still show sample data and exist in development only. */
const ALL_LINKS = [
  { to: "/cases", icon: FolderOpen, label: "Case Management" },
  { to: "/upload", icon: Upload, label: "Evidence Upload" },
  { to: "/admin", icon: ShieldCheck, label: "Role Management" },
  { to: "/evidence", icon: Search, label: "Evidence Viewer (sample)", demoOnly: true },
  { to: "/custody", icon: GitBranch, label: "Chain of Custody (sample)", demoOnly: true },
];

/** The links the current wallet's role may use. Fails closed: nothing is listed until the role is known. */
export function useNavLinks() {
  const { can, isDemo } = useRole();
  return ALL_LINKS.filter((link) => (!link.demoOnly || isDemo) && can(ROUTE_CAPABILITY[link.to]));
}
