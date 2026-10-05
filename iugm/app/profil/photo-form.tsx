"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { uploadPhotoAction, removePhotoAction, type ProfileState } from "./actions";

const primaryButtonClass =
  "rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:opacity-50";
const secondaryButtonClass =
  "rounded-xl border border-black/10 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-zinc-800";

const initialState: ProfileState = {};

// Recadre au format portrait 3:4 (centré) et réduit en JPEG : une photo de
// téléphone fait plusieurs Mo, bien au-delà de la limite d'envoi de 1 Mo.
const PHOTO_WIDTH = 600;
const PHOTO_HEIGHT = 800;

function toPortraitJpeg(source: CanvasImageSource, width: number, height: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_WIDTH;
  canvas.height = PHOTO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas indisponible"));

  const targetRatio = PHOTO_WIDTH / PHOTO_HEIGHT;
  let sw = width;
  let sh = height;
  if (width / height > targetRatio) sw = height * targetRatio;
  else sh = width / targetRatio;
  ctx.drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(new File([blob], "photo-identite.jpg", { type: "image/jpeg" }))
          : reject(new Error("Conversion impossible")),
      "image/jpeg",
      0.88,
    );
  });
}

async function importedToPortraitJpeg(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    return await toPortraitJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

// Photo de profil : importée depuis l'appareil ou prise avec la caméra. Pour
// un étudiant, c'est sa photo d'identité, affichée sur la carte étudiante
// numérique (page publique ouverte en scannant son QR code).
export function PhotoForm({
  currentPhoto,
  initials,
  isStudent = false,
}: {
  currentPhoto?: string | null;
  initials: string;
  isStudent?: boolean;
}) {
  const [uploadState, uploadFormAction, uploadPending] = useActionState(
    uploadPhotoAction,
    initialState,
  );
  const [removeState, removeFormAction, removePending] = useActionState(
    removePhotoAction,
    initialState,
  );
  const state = uploadState.error || uploadState.success ? uploadState : removeState;

  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  // Coupe la caméra si l'on quitte la page avec elle allumée
  useEffect(() => stopCamera, [stopCamera]);

  // Libère l'aperçu précédent
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  function setChosenFile(file: File) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    if (fileRef.current) fileRef.current.files = transfer.files;
    setPreview(URL.createObjectURL(file));
  }

  async function openCamera() {
    setLocalError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setLocalError("La caméra n'est pas disponible sur cet appareil : importez une photo.");
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      setCameraOpen(true);
    } catch {
      setLocalError(
        "Impossible d'accéder à la caméra (autorisation refusée ou aucune caméra) : importez une photo à la place.",
      );
    }
  }

  async function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      setChosenFile(await toPortraitJpeg(video, video.videoWidth, video.videoHeight));
      stopCamera();
    } catch {
      setLocalError("La capture a échoué, réessayez ou importez une photo.");
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setLocalError(null);
    try {
      setChosenFile(await importedToPortraitJpeg(file));
    } catch {
      setLocalError(
        "Ce fichier n'a pas pu être lu comme une image. Choisissez une photo JPEG, PNG ou WebP.",
      );
      input.value = "";
      setPreview(null);
    }
  }

  const shownPhoto = preview ?? currentPhoto;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        {shownPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL Blob ou aperçu local, next/image inutile ici
          <img
            src={shownPhoto}
            alt="Photo de profil"
            className={
              isStudent
                ? "h-32 w-24 rounded-xl border border-black/10 object-cover dark:border-white/10"
                : "h-20 w-20 rounded-full border border-black/10 object-cover dark:border-white/10"
            }
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white">
            {initials}
          </div>
        )}
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {preview
            ? "Aperçu : cliquez sur « Enregistrer la photo » pour la valider."
            : currentPhoto
              ? isStudent
                ? "Votre photo apparaît sur votre carte étudiante (scan du QR code)."
                : "Votre photo apparaît dans la barre du haut."
              : isStudent
                ? "Aucune photo d'identité pour le moment."
                : "Aucune photo : vos initiales sont affichées."}
        </p>
      </div>

      {isStudent && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200">
          <p className="font-semibold">Une vraie photo d&apos;identité est demandée</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Visage de face, tête nue, bien éclairé, sur un fond clair et uni.</li>
            <li>Une photo de vous seul(e) : pas de lunettes de soleil, de filtre ni de logo.</li>
            <li>
              Elle s&apos;affiche sur votre carte étudiante numérique, quand quelqu&apos;un
              scanne votre QR code.
            </li>
          </ul>
        </div>
      )}

      {cameraOpen && (
        <div className="space-y-2">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="aspect-[3/4] w-48 -scale-x-100 rounded-xl bg-black object-cover"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={capture} className={primaryButtonClass}>
              Capturer
            </button>
            <button type="button" onClick={stopCamera} className={secondaryButtonClass}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <form action={uploadFormAction} className="space-y-3">
        <input
          ref={fileRef}
          aria-label="Fichier de la photo"
          name="photo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          onChange={onImport}
          className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-300"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={openCamera} disabled={cameraOpen} className={secondaryButtonClass}>
            Prendre une photo
          </button>
          <button type="submit" disabled={uploadPending || !preview} className={primaryButtonClass}>
            {uploadPending ? "Envoi..." : "Enregistrer la photo"}
          </button>
          {currentPhoto && (
            <button
              type="submit"
              formAction={removeFormAction}
              formNoValidate
              disabled={removePending}
              className={secondaryButtonClass}
            >
              Retirer la photo
            </button>
          )}
        </div>
      </form>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Importez un fichier (PNG, JPEG ou WebP) ou prenez-vous en photo : l&apos;image est
        recadrée en portrait et allégée automatiquement.
      </p>

      {(localError || state.error) && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {localError ?? state.error}
        </p>
      )}
      {!localError && state.success && (
        <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {state.success}
        </p>
      )}
    </div>
  );
}
