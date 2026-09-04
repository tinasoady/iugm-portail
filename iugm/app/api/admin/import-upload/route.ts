import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";

// Génère le jeton d'upload direct navigateur -> Vercel Blob pour l'import de
// fiches sur /admin/base-donnees : contourne la limite de ~4,5 Mo imposée par
// Vercel sur le corps d'une requête vers une fonction serverless (voir
// MAX_BYTES dans app/admin/base-donnees/actions.ts, qui reste la limite
// applicative réelle). Le fichier ne transite jamais par notre fonction tant
// qu'il n'est pas confirmé uploadé ; c'est l'action serveur qui va ensuite le
// relire depuis Blob pour le traiter.
const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("imports/")) {
          throw new Error("Chemin d'upload invalide.");
        }
        return {
          allowedContentTypes: [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_BYTES,
        };
      },
      onUploadCompleted: async () => {
        // Rien à faire ici : l'action serveur d'import supprime le blob une
        // fois le fichier lu (succès ou échec), voir actions.ts.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lors de la génération du jeton d'upload." },
      { status: 400 },
    );
  }
}
