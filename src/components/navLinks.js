import { FolderOpen, ShieldCheck, Upload } from "lucide-react";
import { useRole } from "../context/roleContext.js";
import { ROUTE_CAPABILITY } from "../web3/roles.js";

/** Every possible link. */
const ALL_LINKS = [
  { to: "/cases", icon: FolderOpen, label: "Case Management" },
  { to: "/upload", icon: Upload, label: "Evidence Upload" },
  { to: "/admin", icon: ShieldCheck, label: "Role Management" },
];

/** The links the current wallet's role may use. Fails closed: nothing is listed until the role is known. */
export function useNavLinks() {
  const { can } = useRole();
  return ALL_LINKS.filter((link) => can(ROUTE_CAPABILITY[link.to]));
}
