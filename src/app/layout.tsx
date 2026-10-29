import ErrorLogger from "@/components/ErrorLogger";
import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";

// Fonts are downloaded at build time and served from our own server –
// visitors' browsers never contact Google Fonts.
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono", display: "swap" });

const TITLE = "RouteCam – Fahrvideos auf dem 3D-Globus";
const DESCRIPTION =
  "Fahrvideo und GPS-Strecke synchron: Während das YouTube-Video läuft, fährt die Route über einen 3D-Globus mit Höhenprofil. Kostenlos, im Browser, ohne Download.";
const OG_IMAGE = "https://maurice-baradari.de/routecam/og-image.jpg";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://maurice-baradari.de/routecam/",
    siteName: "RouteCam",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "RouteCam" }],
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export const viewport = {
  themeColor: "#12171c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className={`${geist.variable} ${geistMono.variable} h-full bg-black`}>
      <head>
        {/*
         * MapLibre GL CSS is served as a static public file to avoid Turbopack
         * PostCSS processing issues with this particular stylesheet.
         */}
        <link rel="stylesheet" href="/routecam/maplibre-gl.css" />
      </head>
      <body className="h-full antialiased font-sans">
        <ErrorLogger />
        {children}
      </body>
    </html>
  );
}
