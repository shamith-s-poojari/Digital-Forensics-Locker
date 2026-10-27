// TEST FIXTURES. Every value in this file is made up: the case ids, wallet addresses, file hashes, IPFS CIDs,
// transaction hashes and block numbers do not refer to real cases, evidence, people or blockchain records. Used only
// by the in-memory ledger and the tests; nothing here is imported by the application.

export const fixtureEvidence = [
  { id: "EVD-2025-001", caseId: "CASE-2025-0042", fileName: "crime_scene_photo_01.jpg", fileType: "Digital Image", hash: "a3f5c2d1e8b7094f6a2c5d8e1f4b7c0a3f5c2d1e8b7094f6a2c5d8e1f4b7c0a0", cid: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco", submittedBy: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", timestamp: "2025-06-01 09:23:11", status: "Verified" },
  { id: "EVD-2025-002", caseId: "CASE-2025-0042", fileName: "suspect_device_log.txt", fileType: "Device Log", hash: "b4e6d3f2a9c8175e7b3d6f9a2c5e8b1d4e6d3f2a9c8175e7b3d6f9a2c5e8b1d0", cid: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", submittedBy: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", timestamp: "2025-06-01 10:45:33", status: "Verified" },
  { id: "EVD-2025-003", caseId: "CASE-2025-0038", fileName: "financial_records.pdf", fileType: "Document", hash: "c5f7e4a3b0d9286f8c4e7a0b3d6f9c2e5f7e4a3b0d9286f8c4e7a0b3d6f9c2e0", cid: "QmZTR5amvZeo4oEnTiRrbqyYaFgkNpCM5bqAc85zzuNKJi", submittedBy: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", timestamp: "2025-06-02 14:12:05", status: "Pending" },
  { id: "EVD-2025-004", caseId: "CASE-2025-0051", fileName: "surveillance_video_02.mp4", fileType: "Video", hash: "d6a8f5b4c1e0397a9d5f8b1c4e7a0d3f6a8f5b4c1e0397a9d5f8b1c4e7a0d3f0", cid: "QmaNPZnKXRE4yBkx3r3e2HrBR5c8VWDELJhVjJ7mXpDtQK", submittedBy: "0x9C7a34f0B6e1dF8a2C4d5E9f0B3a4C5d6E7f8A9b", timestamp: "2025-06-03 08:30:47", status: "Flagged" },
  { id: "EVD-2025-005", caseId: "CASE-2025-0051", fileName: "call_logs_export.csv", fileType: "Device Log", hash: "e7b9a6c5d2f1408b0e6a9c2d5f8b1e4a7b9a6c5d2f1408b0e6a9c2d5f8b1e4a0", cid: "QmbFMke1KXqnYyBBWxB74N4c5SBnJMVAiMhT5i2BMMTSM", submittedBy: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", timestamp: "2025-06-03 11:22:19", status: "Verified" },
  { id: "EVD-2025-006", caseId: "CASE-2025-0038", fileName: "email_screenshot.png", fileType: "Digital Image", hash: "f8c0b7d6e3a2519c1f7b0d3e6a9c2f5b8c0b7d6e3a2519c1f7b0d3e6a9c2f5b0", cid: "QmPZ9gcCEpqKTo9ikXESCbZe5LmFJFdBHG7BYwCG3YNZVY", submittedBy: "0xa1B2c3D4e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9B0", timestamp: "2025-06-04 16:05:52", status: "Verified" },
  { id: "EVD-2025-007", caseId: "CASE-2025-0029", fileName: "ransomware_hash.txt", fileType: "Document", hash: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a00", cid: "bafybeigdyrzt5sfp7edupa6g6csmvefqwuzrqqqsmjhl6sjw37jqyw33iq", submittedBy: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", timestamp: "2025-06-05 13:45:22", status: "Verified" },
  { id: "EVD-2025-008", caseId: "CASE-2025-0042", fileName: "network_traffic_pcap.bin", fileType: "Device Log", hash: "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b00", cid: "bafybeicyc4v5zw7lqgnvuzcqb5rmrjd5z5xqyb6lxgkllrpiltvv7x32e4", submittedBy: "0x9C7a34f0B6e1dF8a2C4d5E9f0B3a4C5d6E7f8A9b", timestamp: "2025-06-05 10:15:38", status: "Pending" },
  { id: "EVD-2025-009", caseId: "CASE-2025-0051", fileName: "witness_statement_video.mp4", fileType: "Video", hash: "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c00", cid: "bafybeihhbtbvzgddvgkpwvhhctqmaxfq2cjxzegx3rq2fwn32gvkhv4eea", submittedBy: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", timestamp: "2025-06-06 09:30:44", status: "Verified" }
];

export const fixtureCases = [
  { id: "CASE-2025-0042", title: "Cyber Fraud Investigation - Bank Heist", officer: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", dateOpened: "2025-05-28", evidenceCount: 3, status: "Active" },
  { id: "CASE-2025-0038", title: "Corporate Data Breach - TechCorp Ltd", officer: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", dateOpened: "2025-05-20", evidenceCount: 2, status: "Under Review" },
  { id: "CASE-2025-0051", title: "Organized Crime Network - Operation Ghost", officer: "0x9C7a34f0B6e1dF8a2C4d5E9f0B3a4C5d6E7f8A9b", dateOpened: "2025-06-01", evidenceCount: 3, status: "Active" },
  { id: "CASE-2025-0029", title: "Ransomware Attack - City Hospital", officer: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", dateOpened: "2025-05-10", evidenceCount: 1, status: "Closed" }
];

export const fixtureCustodyLog = [
  { id: "LOG-001", eventType: "Submit", cidHash: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco", actor: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", timestamp: "2025-06-01 09:23:11", txHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1", blockNumber: 7482910 },
  { id: "LOG-002", eventType: "Access", cidHash: "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco", actor: "0x9C7a34f0B6e1dF8a2C4d5E9f0B3a4C5d6E7f8A9b", timestamp: "2025-06-01 11:10:05", txHash: "0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4", blockNumber: 7483102 },
  { id: "LOG-003", eventType: "Verify", cidHash: "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG", actor: "0x8ba1f109551bD432803012645Ac136ddd64DBA72", timestamp: "2025-06-02 14:12:05", txHash: "0x789012abc345def678901abc234def567890abc123def456abc789def012abc3", blockNumber: 7483250 },
  { id: "LOG-004", eventType: "Submit", cidHash: "bafybeigdyrzt5sfp7edupa6g6csmvefqwuzrqqqsmjhl6sjw37jqyw33iq", actor: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", timestamp: "2025-06-03 08:30:47", txHash: "0x321cba654fed987abc321cba654fed987abc321cba654fed987abc321cba654f", blockNumber: 7484500 },
  { id: "LOG-005", eventType: "Access", cidHash: "bafybeicyc4v5zw7lqgnvuzcqb5rmrjd5z5xqyb6lxgkllrpiltvv7x32e4", actor: "0x9C7a34f0B6e1dF8a2C4d5E9f0B3a4C5d6E7f8A9b", timestamp: "2025-06-05 14:30:10", txHash: "0x654fed321cba987def654fed321cba987def654fed321cba987def654fed321c", blockNumber: 7485100 }
];
