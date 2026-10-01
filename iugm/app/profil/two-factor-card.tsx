"use client";

import { useActionState } from "react";
import { FaShieldAlt, FaCheckCircle } from "react-icons/fa";

import {
  startTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  regenerateRecoveryCodesAction,
  disableTwoFactorAction,
  type TwoFactorState,
} from "./two-factor-actions";

const inputClass =
  "mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500/40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-200";
const primaryButtonClass =
  "rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800";
const dangerButtonClass =
  "rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950";

const initialState: TwoFactorState = {};

function Feedback({ state }: { state: TwoFactorState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
      {state.success && !state.recoveryCodes && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}
    </div>
  );
}

function RecoveryCodes({ codes, message }: { codes: string[]; message?: string }) {
  return (
    <div className="space-y-3">
      {message && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {message}
        </p>
      )}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          Codes de secours — à conserver dès maintenant
        </p>
        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
          Chaque code ne fonctionne qu&apos;une fois et remplace l&apos;application si vous perdez
          votre téléphone. Ils ne seront plus affichés : notez-les ou imprimez cette page, et
          gardez-les à part de votre mot de passe.
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-zinc-900 dark:text-zinc-50">
          {codes.map((code) => (
            <li
              key={code}
              className="rounded-lg bg-white px-3 py-1.5 text-center tracking-wider dark:bg-zinc-900"
            >
              {code}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function TwoFactorCard({
  enabled,
  recoveryCodesLeft,
}: {
  enabled: boolean;
  recoveryCodesLeft: number;
}) {
  const [startState, startAction, startPending] = useActionState(
    startTwoFactorSetupAction,
    initialState,
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmTwoFactorSetupAction,
    initialState,
  );
  const [regenState, regenAction, regenPending] = useActionState(
    regenerateRecoveryCodesAction,
    initialState,
  );
  const [disableState, disableAction, disablePending] = useActionState(
    disableTwoFactorAction,
    initialState,
  );

  const shownCodes = confirmState.recoveryCodes ?? regenState.recoveryCodes;
  const shownMessage = confirmState.recoveryCodes ? confirmState.success : regenState.success;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            enabled
              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
          aria-hidden="true"
        >
          {enabled ? <FaCheckCircle size={16} /> : <FaShieldAlt size={16} />}
        </span>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {enabled ? (
            <>
              <strong className="text-zinc-900 dark:text-zinc-50">Activée.</strong> À chaque
              connexion, un code à 6 chiffres généré par votre application d&apos;authentification
              est demandé en plus du mot de passe.
            </>
          ) : (
            <>
              Ajoute un code temporaire (application Google Authenticator, Microsoft Authenticator,
              Authy…) à votre mot de passe : même volé, celui-ci ne suffit plus pour entrer.
              Recommandé pour les comptes qui gèrent les dossiers et les paiements.
            </>
          )}
        </p>
      </div>

      {shownCodes && <RecoveryCodes codes={shownCodes} message={shownMessage} />}

      {/* Configuration en cours : scan du QR code puis confirmation par un code */}
      {!enabled && !confirmState.recoveryCodes && (
        <>
          {!startState.setup ? (
            <form action={startAction}>
              <button type="submit" disabled={startPending} className={primaryButtonClass}>
                {startPending ? "Préparation..." : "Activer la double authentification"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                <li>Ouvrez votre application d&apos;authentification.</li>
                <li>Scannez le QR code ci-dessous (ou saisissez la clé à la main).</li>
                <li>Entrez le code à 6 chiffres qu&apos;elle affiche pour confirmer.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici */}
                <img
                  src={startState.setup.qrDataUrl}
                  alt="QR code à scanner avec votre application d'authentification"
                  width={160}
                  height={160}
                  className="rounded-xl border border-black/10 bg-white p-1 dark:border-white/10"
                />
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  <p>Clé de configuration manuelle :</p>
                  <p className="mt-1 select-all break-all font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {startState.setup.secret}
                  </p>
                </div>
              </div>
              <form action={confirmAction} className="space-y-3">
                <div>
                  <label className={labelClass} htmlFor="tf-code">
                    Code à 6 chiffres
                  </label>
                  <input
                    id="tf-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,7}"
                    maxLength={7}
                    required
                    className={inputClass}
                  />
                </div>
                <Feedback state={confirmState} />
                <button type="submit" disabled={confirmPending} className={primaryButtonClass}>
                  {confirmPending ? "Vérification..." : "Confirmer et activer"}
                </button>
              </form>
            </div>
          )}
          <Feedback state={startState} />
        </>
      )}

      {/* Gestion une fois activée */}
      {enabled && (
        <div className="space-y-5 border-t border-black/5 pt-4 dark:border-white/10">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Codes de secours restants :{" "}
            <strong className="text-zinc-900 dark:text-zinc-50">{recoveryCodesLeft}</strong>
            {recoveryCodesLeft <= 2 && " — pensez à en générer de nouveaux."}
          </p>

          <form action={regenAction} className="space-y-2">
            <label className={labelClass} htmlFor="tf-regen-password">
              Générer de nouveaux codes de secours
            </label>
            <input
              id="tf-regen-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Votre mot de passe actuel"
              required
              className={inputClass}
            />
            <Feedback state={regenState} />
            <button type="submit" disabled={regenPending} className={secondaryButtonClass}>
              {regenPending ? "Génération..." : "Régénérer les codes"}
            </button>
          </form>

          <form
            action={disableAction}
            className="space-y-2"
            onSubmit={(e) => {
              if (
                !window.confirm(
                  "Désactiver la double authentification ? Votre compte ne sera plus protégé que par votre mot de passe.",
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            <label className={labelClass} htmlFor="tf-disable-password">
              Désactiver la double authentification
            </label>
            <input
              id="tf-disable-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Votre mot de passe actuel"
              required
              className={inputClass}
            />
            <Feedback state={disableState} />
            <button type="submit" disabled={disablePending} className={dangerButtonClass}>
              {disablePending ? "Désactivation..." : "Désactiver"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
