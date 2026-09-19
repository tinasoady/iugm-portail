"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { IconMenu, IconClose } from "./icons";

// `document` n'existe pas côté serveur : on ne rend le portail qu'une fois
// monté côté client. `useSyncExternalStore` (plutôt qu'un useEffect qui
// appellerait setState) évite tout flash d'hydratation — voir le même choix
// et sa justification dans OfflineSyncStatus.
const subscribeNever = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

type NavChild = { href: string; label: string };

type NavEntry = {
  href: string;
  label: string;
  icon: ReactNode;
  children?: NavChild[];
};

// Menu mobile façon "tiroir" (hamburger) : masqué sous md (la sidebar fixe
// prend le relais à partir de cette largeur).
//
// Le bouton déclencheur reste dans l'en-tête, mais le fond + le tiroir sont
// rendus via un portail directement dans <body>. Nécessaire car l'en-tête
// utilise `backdrop-blur` (backdrop-filter), qui crée un nouveau "containing
// block" CSS pour tout descendant en `position: fixed` : sans portail, le
// tiroir restait coincé dans la hauteur de l'en-tête au lieu de couvrir
// l'écran, ce qui le rendait invisible au clic.
export function MobileNav({
  items,
  active,
  institutionAcronym,
  logo,
}: {
  items: NavEntry[];
  active: string;
  institutionAcronym: string;
  logo?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(subscribeNever, getMountedSnapshot, getServerMountedSnapshot);
  const close = () => setOpen(false);

  // Ferme au clavier (Échap) et bloque le défilement du fond pendant que le
  // tiroir est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const drawer = (
    <>
      {/* Fond : ferme le tiroir au clic en dehors */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={close}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] md:hidden"
      />

      {/* Tiroir de navigation */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[82%] flex-col bg-zinc-950 shadow-2xl md:hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL, next/image inutile ici
              <img
                src={logo}
                alt={`Logo ${institutionAcronym}`}
                className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain p-0.5 shadow-lg"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg">
                IU
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-wide text-white">{institutionAcronym}</p>
              <p className="text-[11px] text-zinc-400">Gestion de scolarité</p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer le menu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <IconClose />
          </button>
        </div>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-6">
          {items.map((item) => {
            const isActive = item.href === active;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  className={
                    isActive
                      ? "flex items-center gap-3 rounded-xl bg-indigo-600 px-3 py-3 text-sm font-semibold text-white shadow-md"
                      : "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white"
                  }
                >
                  {item.icon}
                  {item.label}
                </Link>
                {item.children && (
                  <div className="mt-1 ml-6 space-y-1 border-l border-white/10 pl-3">
                    {item.children.map((child) => {
                      const isChildActive = child.href === active;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={close}
                          className={
                            isChildActive
                              ? "block rounded-lg px-3 py-2 text-xs font-semibold text-white"
                              : "block rounded-lg px-3 py-2 text-xs font-medium text-zinc-500 transition hover:bg-white/5 hover:text-white"
                          }
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-100 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <IconMenu />
      </button>
      {mounted && open ? createPortal(drawer, document.body) : null}
    </>
  );
}
