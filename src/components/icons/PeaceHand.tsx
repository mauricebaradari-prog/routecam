// „Peace“-Hand (Victory-Zeichen) – so grüßen sich Biker auf der Straße. Ersetzt den Daumen hoch für Likes.
// Eigene Zeichnung im Stil der Lucide-Icons (24 × 24, Strich 2, runde Enden), damit sie neben den anderen Icons passt.
import React from 'react';

export default function PeaceHand({ size = 24, strokeWidth = 2, className, ...rest }: { size?: number; strokeWidth?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden {...rest}>
      {/* Zeige- und Mittelfinger als V */}
      <path d="M10.1 10.5L7.9 3.3A1.8 1.8 0 0 0 4.5 4.3L6.7 11.5" />
      <path d="M14 11.3L17.2 4.3A1.8 1.8 0 0 0 14 2.9L10.8 9.9" />
      {/* Faust mit eingeklapptem Ring- und kleinem Finger */}
      <path d="M6.7 11.5C5.4 12 5 13.4 5.2 15c.4 3.2 2.6 5 5.6 5h1.6c3 0 5.4-2.4 5.4-5.5V13a2 2 0 0 0-4 0v-1.7" />
      {/* Daumen */}
      <path d="M5.4 14.4c1.8-1.2 4.6-1.4 6.4-.2" />
      {/* Ärmel */}
      <path d="M8.4 22.5h6" />
      {/* Bewegungsstriche */}
      <path d="m19.4 5.6 1.6-1.3M19.8 8.6l2.1-.1" />
    </svg>
  );
}
