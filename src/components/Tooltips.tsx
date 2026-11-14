'use client';
// Ein Tooltip für alles, was man mit der Maus ansteuern kann (Knöpfe, Links, Menüpunkte).
// Der Text kommt aus `data-tip`, sonst `title`, sonst `aria-label`. Das native `title` wird beim
// Darüberfahren in `data-tip` verschoben, damit der Browser nicht zusätzlich seinen eigenen zeigt.
// Steht der Text schon genauso sichtbar auf dem Knopf, gibt es keinen Tooltip (er würde nur doppeln).
// Nur mit Maus/Trackpad – auf Touch-Geräten gibt es kein Hover.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TARGET = 'button, a[href], [role="button"], [role="menuitem"], [role="tab"], [data-tip], select, summary';
const DELAY = 350;

type Tip = { text: string; x: number; y: number; place: 'above' | 'below' | 'right' };

function tipText(el: HTMLElement): string {
  if (el.hasAttribute('data-no-tip')) return '';
  const title = el.getAttribute('title');
  if (title) { el.dataset.tip = title; el.removeAttribute('title'); }
  const text = (el.dataset.tip || el.getAttribute('aria-label') || '').trim();
  if (!text) return '';
  const visible = (el.innerText || '').replace(/\s+/g, ' ').trim();
  if (visible && visible.toLowerCase() === text.toLowerCase()) return '';
  return text;
}

export default function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<number | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const clear = () => {
      if (timer.current) { clearTimeout(timer.current); timer.current = null; }
      current.current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (e.target as Element | null)?.closest?.(TARGET) as HTMLElement | null;
      if (el === current.current) return;
      clear();
      if (!el || (el as HTMLButtonElement).disabled && !el.dataset.tip && !el.getAttribute('title')) return;
      const text = tipText(el);
      if (!text) return;
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (current.current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        // Knöpfe am linken Rand (Spalte links an der Karte): rechts daneben, sonst darüber bzw. darunter
        if (r.left < 120 && r.width < 80) setTip({ text, x: r.right + 8, y: r.top + r.height / 2, place: 'right' });
        else if (r.top < 48) setTip({ text, x: r.left + r.width / 2, y: r.bottom + 8, place: 'below' });
        else setTip({ text, x: r.left + r.width / 2, y: r.top - 8, place: 'above' });
      }, DELAY);
    };
    // Fenster verlassen (sonst erledigt `over` den Wechsel auf ein anderes Element)
    const out = (e: PointerEvent) => { if (!e.relatedTarget) clear(); };
    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('pointerdown', clear, true);
    document.addEventListener('keydown', clear, true);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('pointerdown', clear, true);
      document.removeEventListener('keydown', clear, true);
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('blur', clear);
    };
  }, []);

  if (!tip || typeof document === 'undefined') return null;
  return createPortal(<TipBubble tip={tip} />, document.body);
}

function TipBubble({ tip }: { tip: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  // im Bild halten: nicht über den linken/rechten Rand hinaus
  useLayoutEffect(() => {
    const el = ref.current; if (!el || tip.place === 'right') return;
    const w = el.offsetWidth;
    el.style.left = `${Math.min(window.innerWidth - 8 - w / 2, Math.max(8 + w / 2, tip.x))}px`;
  }, [tip]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className="rc-tip pointer-events-none fixed z-[10000] max-w-[260px] rounded-md border border-white/10 bg-[#1a1a1a] px-2 py-1 text-[12px] font-medium leading-snug text-white shadow-lg"
      style={{ left: tip.x, top: tip.y, transform: tip.place === 'right' ? 'translate(0, -50%)' : `translate(-50%, ${tip.place === 'below' ? '0' : '-100%'})` }}
    >
      {tip.text}
    </div>
  );
}
