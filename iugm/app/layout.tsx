import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "./ui/service-worker-registration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IUGM - Gestion de Scolarité",
  description: "Système Cloud de Gestion des Inscriptions et de la Scolarité Universitaire",
  manifest: "/manifest.json",
  // iOS Safari n'utilise pas le manifest pour "Ajouter à l'écran d'accueil" :
  // sans ces balises, l'app s'ouvrait dans un onglet Safari normal (barre
  // d'adresse visible) au lieu du mode standalone déjà obtenu sur Android.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "IUGM Portail",
  },
  icons: {
    apple: "/icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#193cb8",
};

// Applique le thème avant le premier rendu pour éviter le flash clair/sombre.
// Préférence enregistrée dans localStorage("theme"), sinon préférence système.
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
