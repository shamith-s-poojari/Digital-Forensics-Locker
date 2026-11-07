import { useEffect, useId, useRef, useState } from "react";
import { Lock, LockKeyhole } from "lucide-react";
import { useWallet } from "../context/walletContext.js";
import { accountName } from "../web3/accountNames.js";
import { shorten } from "../web3/format.js";
import { Button, Field, INPUT_CLASS } from "./ui";

const PIN_PATTERN = /^\d{4,8}$/;
const digitsOnly = (value) => value.replace(/\D/g, "").slice(0, 8);

/**
 * The app's lock screen. A website cannot lock MetaMask, so the app locks itself: every sign-in, and so every role
 * switch, covers the whole page until the PIN of the account being signed in as is entered. The server checks the PIN
 * together with the wallet signature (server/rolePins.js); this screen only collects it.
 */
export default function PinLock() {
  const { pinPrompt, submitPin, cancelPin } = useWallet();
  if (!pinPrompt) return null;
  // Keyed by prompt so a new prompt (another account, a retry after a wrong PIN) starts with empty fields.
  return <PinLockDialog key={`${pinPrompt.address}:${pinPrompt.mode}:${pinPrompt.error ?? ""}`} prompt={pinPrompt} onSubmit={submitPin} onCancel={cancelPin} />;
}

function PinLockDialog({ prompt, onSubmit, onCancel }) {
  const { address, mode, error } = prompt;
  const creating = mode === "create";
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState(null);
  const titleId = useId();
  const pinId = useId();
  const confirmId = useId();
  const inputRef = useRef(null);
  const name = accountName(address);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!PIN_PATTERN.test(pin)) return setLocalError("A PIN is 4 to 8 digits.");
    if (creating && pin !== confirm) return setLocalError("The two PINs do not match.");
    setLocalError(null);
    onSubmit(pin);
  };

  const shownError = localError ?? error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: "var(--color-slate-950)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 text-left shadow-2xl" noValidate>
        <div className="mb-4 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-100">
            {creating ? <LockKeyhole className="size-5" aria-hidden="true" /> : <Lock className="size-5" aria-hidden="true" />}
          </span>
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-50">
              {creating ? "Set a PIN for this account" : "Locked"}
            </h2>
            <p className="text-sm text-slate-300">
              {name ? <span className="font-semibold text-slate-100">{name} </span> : null}
              <span className="font-mono text-xs text-slate-400" title={address}>
                {shorten(address, 6, 4)}
              </span>
            </p>
          </div>
        </div>

        <p className="mb-4 text-sm text-slate-400">
          {creating
            ? "Choose a 4 to 8 digit PIN. It will be asked every time this account signs in or someone switches to it."
            : "Enter this account's PIN to unlock. MetaMask will then ask you to sign in."}
        </p>

        <div className="space-y-3">
          <Field label={creating ? "New PIN" : "PIN"} htmlFor={pinId} error={!creating || !confirm ? shownError : null}>
            <input
              ref={inputRef}
              id={pinId}
              type="password"
              inputMode="numeric"
              autoComplete={creating ? "new-password" : "current-password"}
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value))}
              className={`${INPUT_CLASS} font-mono tracking-[0.4em]`}
            />
          </Field>
          {creating ? (
            <Field label="Repeat PIN" htmlFor={confirmId} error={confirm ? shownError : null}>
              <input
                id={confirmId}
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={8}
                value={confirm}
                onChange={(e) => setConfirm(digitsOnly(e.target.value))}
                className={`${INPUT_CLASS} font-mono tracking-[0.4em]`}
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {creating ? "Sign out" : "Cancel"}
          </Button>
          <Button variant="primary" type="submit">
            {creating ? "Save PIN" : "Unlock"}
          </Button>
        </div>
      </form>
    </div>
  );
}
