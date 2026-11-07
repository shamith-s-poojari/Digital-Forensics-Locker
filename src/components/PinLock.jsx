import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, Lock, LockKeyhole } from "lucide-react";
import { useWallet } from "../context/walletContext.js";
import { accountName } from "../web3/accountNames.js";
import { shorten } from "../web3/format.js";
import { Button, Field, INPUT_CLASS } from "./ui";

// Same rule as server/rolePins.js (isValidPin), which is the one that counts.
const MAX_LENGTH = 64;
const RULE = "8 to 64 characters with at least one letter, one number and one symbol, and no spaces.";
const isStrongPassword = (value) =>
  value.length >= 8 &&
  value.length <= MAX_LENGTH &&
  !/\s/.test(value) &&
  /\p{L}/u.test(value) &&
  /\p{N}/u.test(value) &&
  /[^\p{L}\p{N}\s]/u.test(value);

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
  const [shown, setShown] = useState(false);
  const titleId = useId();
  const pinId = useId();
  const confirmId = useId();
  const inputRef = useRef(null);
  const name = accountName(address);

  const dialogRef = useRef(null);

  // This screen usually opens the moment MetaMask's popup closes, while that popup still has the OS focus, so the
  // first focus() is lost and typing goes nowhere. Focus the PIN field again whenever the window comes back, unless
  // the user is already in one of the dialog's controls.
  useEffect(() => {
    const focusPin = () => {
      if (!dialogRef.current?.contains(document.activeElement)) inputRef.current?.focus();
    };
    focusPin();
    window.addEventListener("focus", focusPin);
    return () => window.removeEventListener("focus", focusPin);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!pin) return setLocalError("Enter the password.");
    // Only a new password must meet the rule: numeric PINs set before it still unlock.
    if (creating && !isStrongPassword(pin)) return setLocalError(`A password is ${RULE}`);
    if (creating && pin !== confirm) return setLocalError("The two passwords do not match.");
    setLocalError(null);
    onSubmit(pin);
  };

  const shownError = localError ?? error;

  return (
    <div
      ref={dialogRef}
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
              {creating ? "Set a password for this account" : "Locked"}
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
            ? `Choose a password: ${RULE} It will be asked every time this account signs in or someone switches to it.`
            : "Enter this account's password to unlock. MetaMask will then ask you to sign in."}
        </p>

        <div className="space-y-3">
          <Field label={creating ? "New password" : "Password"} htmlFor={pinId} error={!creating || !confirm ? shownError : null}>
            <div className="relative">
              <input
                ref={inputRef}
                id={pinId}
                type={shown ? "text" : "password"}
                autoComplete={creating ? "new-password" : "current-password"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_LENGTH}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={`${INPUT_CLASS} pr-11 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShown((v) => !v)}
                aria-label={shown ? "Hide password" : "Show password"}
                aria-pressed={shown}
                className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40"
              >
                {shown ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
              </button>
            </div>
          </Field>
          {creating ? (
            <Field label="Repeat password" htmlFor={confirmId} error={confirm ? shownError : null}>
              <input
                id={confirmId}
                type={shown ? "text" : "password"}
                autoComplete="new-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={MAX_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`${INPUT_CLASS} font-mono`}
              />
            </Field>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {creating ? "Sign out" : "Cancel"}
          </Button>
          <Button variant="primary" type="submit">
            {creating ? "Save password" : "Unlock"}
          </Button>
        </div>
      </form>
    </div>
  );
}
