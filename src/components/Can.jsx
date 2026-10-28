import { useRole } from "../context/roleContext.js";

/**
 * Conditional rendering by capability: shows `children` only if the wallet's role grants it, otherwise `fallback`.
 * While roles are loading, or unknown for any reason, it shows the fallback (fail closed).
 *
 *   <Can capability={CAPABILITIES.UPLOAD}><UploadButton /></Can>
 *
 * Hiding UI is a courtesy; the contract still rejects anything the wallet is not allowed to do.
 */
export default function Can({ capability, fallback = null, children }) {
  const { can } = useRole();
  return can(capability) ? children : fallback;
}
