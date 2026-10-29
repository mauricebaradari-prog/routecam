import ErrorLogger from "@/components/ErrorLogger";
import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full bg-black">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&display=swap" rel="stylesheet" />
        {/*
         * MapLibre GL CSS is served as a static public file to avoid Turbopack
         * PostCSS processing issues with this particular stylesheet.
         */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="/routecam/maplibre-gl.css" />
      </head>
      <body className="h-full antialiased font-sans">
        <ErrorLogger />
        {children}
      </body>
    </html>
  );
}
