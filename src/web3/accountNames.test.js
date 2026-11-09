import { describe, expect, it } from "vitest";
import { accountLabel, accountName } from "./accountNames.js";
import { readAccountNames } from "./config.js";

const INV_1 = "0xE07cAA20fB53Ae4efE7586933507F806a42B2dAe";
const INV_2 = "0xDbcAa4b3C55b93691C26c55540Affc69D8d9402f";

describe("account display names", () => {
  it("reads 0xAddress=Name pairs, matching addresses in any letter case", () => {
    const names = readAccountNames({ VITE_ACCOUNT_NAMES: ` ${INV_1}=Investigator 1 , ${INV_2.toLowerCase()}=  Investigator   2 ` });
    expect(accountName(INV_1.toLowerCase(), names)).toBe("Investigator 1");
    expect(accountName(INV_2, names)).toBe("Investigator 2");
    expect(accountLabel(INV_1, names)).toBe("Investigator 1 (0xE07c…2dAe)");
  });

  it("ignores malformed entries and unnamed addresses", () => {
    const names = readAccountNames({ VITE_ACCOUNT_NAMES: `not-an-address=X,${INV_1}=,${INV_2},=Nobody` });
    expect(names.size).toBe(0);
    expect(accountName(INV_1, names)).toBeNull();
    expect(accountLabel(INV_1, names)).toBe("0xE07c…2dAe");
    expect(readAccountNames({}).size).toBe(0);
  });

  it("caps very long names", () => {
    const names = readAccountNames({ VITE_ACCOUNT_NAMES: `${INV_1}=${"x".repeat(100)}` });
    expect(accountName(INV_1, names)).toHaveLength(40);
  });
});
