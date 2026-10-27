// Test-only. Under jsdom, ethers' Node implementation of sha256 returns a Buffer from Node's realm, which ethers' own
// byte checks then reject ("invalid BytesLike value"). Re-register sha256 so it returns a Uint8Array of the test
// realm. Browsers and plain Node never hit this, so the app itself is unchanged.
import { createHash } from "node:crypto";
import { sha256 } from "ethers";

sha256.register((data) => new Uint8Array(createHash("sha256").update(data).digest()));
