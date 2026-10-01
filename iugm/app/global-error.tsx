"use client";

// Dernier filet : erreur dans le layout racine lui-même. Remplace tout le
// document, donc doit définir <html> et <body> et ne dépendre d'aucun style
// ni composant de l'application (styles en ligne).
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <main role="alert" style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Le portail est momentanément indisponible</h1>
          <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 16px" }}>
            Une erreur inattendue est survenue. Réessayez dans un instant ; si le problème
            persiste, contactez l&apos;administration.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: "#71717a" }}>
              Référence : <code>{error.digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => unstable_retry()}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              borderRadius: 12,
              border: 0,
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
