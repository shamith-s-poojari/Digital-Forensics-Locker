import { sha256, toUtf8Bytes } from "ethers";
import { fixtureCases } from "./ledgerFixtures.js";
import { deriveCaseRef } from "../../web3/format.js";
import { computeCaseDigest } from "../../cases/caseDigest.js";

/**
 * Test fixtures: the fixture cases as case-store entries (version 1 each). Their salts are
 * derived from the case number so the in-memory ledger can anchor the same digests when seeded; real salts are random.
 */
export const FIXTURE_CASES = fixtureCases.map((c) => {
  const caseRef = deriveCaseRef(c.id);
  const salt = sha256(toUtf8Bytes(`dfl-test-fixture-salt:${c.id}`)).slice(2);
  const description = `Fixture case (${c.status}).`;
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

/** caseRef -> digest of the fixture case's version 1. */
export const FIXTURE_CASE_DIGESTS = Object.fromEntries(FIXTURE_CASES.map((c) => [c.caseRef, c.versions[0].digest]));
