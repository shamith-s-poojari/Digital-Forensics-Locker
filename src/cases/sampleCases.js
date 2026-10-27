import { sha256, toUtf8Bytes } from "ethers";
import { mockCases } from "../data/mockData";
import { deriveCaseRef } from "../web3/format.js";
import { computeCaseDigest } from "./caseDigest.js";

/**
 * The fictional sample cases as case-store entries (version 1 each), for the development demo only. Their salts are
 * derived from the case number so the demo ledger can anchor the same digests at startup; real salts are random.
 */
export const SAMPLE_CASES = mockCases.map((c) => {
  const caseRef = deriveCaseRef(c.id);
  const salt = sha256(toUtf8Bytes(`dfl-demo-sample-salt:${c.id}`)).slice(2);
  const description = `Fictional sample case (${c.status}).`;
  const at = `${c.dateOpened}T09:00:00.000Z`;
  return {
    caseRef,
    caseNumber: c.id,
    createdBy: c.officer,
    createdAt: at,
    versions: [
      {
        version: 1,
        title: c.title,
        description,
        salt,
        digest: computeCaseDigest({ caseRef, caseNumber: c.id, title: c.title, description, salt }),
        editedBy: c.officer,
        editedAt: at,
      },
    ],
  };
});

/** caseRef -> digest of the sample case's version 1. */
export const SAMPLE_CASE_DIGESTS = Object.fromEntries(SAMPLE_CASES.map((c) => [c.caseRef, c.versions[0].digest]));
