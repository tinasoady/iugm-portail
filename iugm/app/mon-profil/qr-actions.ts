"use server";

import QRCode from "qrcode";

import { getSession } from "@/lib/auth";
import { regenerateStudentQrToken } from "@/lib/students";
import { prisma } from "@/lib/prisma";
import { getAppOrigin } from "@/lib/url";

export type QrCardState = { error?: string; dataUrl?: string };

// Régénère le jeton du QR code de l'étudiant connecté (invalide l'ancien code)
// et renvoie directement la nouvelle image encodée, pour rafraîchir l'aperçu
// sans recharger la page.
export async function regenerateQrAction(
  _prev: QrCardState,
  _formData: FormData,
): Promise<QrCardState> {
  const session = await getSession();
  if (!session || session.role !== "ETUDIANT") {
    return { error: "Accès refusé." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { studentFile: { select: { id: true } } },
  });
  if (!user?.studentFile) {
    return { error: "Aucun dossier étudiant associé à ce compte." };
  }

  try {
    const token = await regenerateStudentQrToken(user.studentFile.id, session.sub);
    const origin = await getAppOrigin();
    const dataUrl = await QRCode.toDataURL(`${origin}/carte-etudiant/${token}`, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    return { dataUrl };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erreur lors de la régénération du code." };
  }
}
