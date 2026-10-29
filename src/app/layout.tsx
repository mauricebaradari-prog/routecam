import ErrorLogger from "@/components/ErrorLogger";
import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";

// Fonts are downloaded at build time and served from our own server –
// visitors' browsers never contact Google Fonts.
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Create your Travel Route Animation - Editor",
  description:
    "Open the free 3D travel map editor. No download, no registration. Select cities, choose vehicle and export video instantly.",
  openGraph: {
    title: "RouteCam - Travel Route Animation",
    description: "Open the free 3D travel map editor. No download, no registration.",
    url: "https://maurice-baradari.de/routecam/",
    siteName: "RouteCam",
    images: [
      {
        url: "https://maurice-baradari.de/routecam/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "RouteCam Preview",
      },
    ],
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RouteCam - Travel Route Animation",
    description: "Open the free 3D travel map editor. No download, no registration.",
    images: ["https://maurice-baradari.de/routecam/og-image.jpg"],
  },
};

export const viewport = {
  themeColor: "#12171c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full bg-black`}>
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
