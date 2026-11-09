// Avatare: Profilbild, wenn es eins gibt – sonst Initialen auf einer Farbe pro Nutzer.
// Die Schriftfarbe wird zur Fläche ausgerechnet (dunkel oder weiß, je nachdem was mehr Kontrast hat),
// damit die Buchstaben immer lesbar sind.

/** Farben, die auf dem dunklen UI gut aussehen; pro Nutzer fest (gleiche Person = gleiche Farbe). */
const PALETTE = ['#CCFF00', '#5EE6FF', '#FF9F43', '#FF6FAE', '#A78BFA', '#34D399', '#FFD43B', '#FF6B6B', '#60A5FA', '#2DD4BF'];
const DARK = '#0b0d10';
const LIGHT = '#ffffff';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** Fläche und Schrift für einen Nutzer (seed = Konto-ID, sonst Name). */
export function avatarColors(seed: string): { bg: string; fg: string } {
  const bg = PALETTE[hash(seed || '?') % PALETTE.length];
  return { bg, fg: contrast(bg, DARK) >= contrast(bg, LIGHT) ? DARK : LIGHT };
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map(p => Array.from(p)[0]!.toUpperCase()).join('');
}

/** Für Avatare, die direkt im DOM gebaut werden (Kommentare auf der Karte). */
export function fillAvatarEl(el: HTMLElement, name: string, picture?: string | null, seed?: string) {
  const { bg, fg } = avatarColors(seed || name);
  el.style.background = bg;
  el.style.color = fg;
  el.textContent = initials(name);
  if (!picture) return;
  const img = document.createElement('img');
  img.src = picture;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.style.cssText = 'width:100%;height:100%;border-radius:9999px;object-fit:cover;display:block';
  img.onload = () => { el.textContent = ''; el.append(img); };
}
