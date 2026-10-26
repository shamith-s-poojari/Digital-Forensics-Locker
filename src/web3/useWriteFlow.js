import { useCallback, useState } from "react";
import { txUrl } from "./config.js";
import { shorten } from "./format.js";
import { friendlyMessage } from "./ledgerErrors.js";
import { useStepFlow } from "./useStepFlow.js";

export const WRITE_STEPS = [
  { key: "sign", label: "Approve in your wallet" },
  { key: "confirm", label: "Confirm on the ledger" },
];

/**
 * Runs wallet transactions and narrates them for the user:
 *   1. "Approve in your wallet"  (active while the signature prompt is open)
 *   2. "Confirm on the ledger"   (active while the transaction waits for a block, with an explorer link)
 * Failures are shown against the step that failed, in plain words (rejected signature, no permission, paused, ...).
 *
 * @param {object} options
 * @param {ReturnType<typeof import("./config.js").readLockerConfig>} options.config
 * @param {() => Promise<unknown> | unknown} [options.onConfirmed] Called after a transaction is mined (reload data).
 * @param {{ key: string, label: string }[]} [options.steps] Stable (module-level) step list. It must contain the
 *        keys "sign" and "confirm"; extra steps (for example "hash" and "pin") can be driven through `flow`.
 */
export function useWriteFlow({ config, onConfirmed, steps = WRITE_STEPS }) {
  const flow = useStepFlow(steps);
  const { reset, start, done, fail, link } = flow;
  const [title, setTitle] = useState("");

  /**
   * @param {string} actionTitle  Shown as the panel heading, for example "Log access".
   * @param {() => Promise<object>} send
   * @param {{ keepSteps?: boolean }} [options] keepSteps: do not clear earlier steps (a multi-step flow owns them).
   * @returns {Promise<{ ok: true, mined: object } | { ok: false }>}
   */
  const runWrite = useCallback(
    async (actionTitle, send, { keepSteps = false } = {}) => {
      setTitle(actionTitle);
      if (!keepSteps) reset();
      let current = "sign";
      start("sign", "Waiting for you to approve the request in your wallet…");
      try {
        const handle = await send();
        done("sign", "Approved in your wallet.");
        current = "confirm";
        start("confirm", `Transaction ${shorten(handle.hash, 8, 6)} sent. Waiting for it to be included in a block…`);
        link("confirm", txUrl(config, handle.hash), "View the transaction on the block explorer");
        const mined = await handle.wait();
        done("confirm", `Included in block ${mined.blockNumber}.`);
        await onConfirmed?.();
        return { ok: true, mined: { ...mined, hash: handle.hash } };
      } catch (err) {
        fail(current, friendlyMessage(err));
        return { ok: false };
      }
    },
    [config, onConfirmed, reset, start, done, fail, link]
  );

  return { runWrite, title, flow, steps: flow.steps, isIdle: flow.isIdle, isRunning: flow.isRunning, dismiss: reset };
}
