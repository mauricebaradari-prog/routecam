'use client';
// Rückfrage vor allem, was etwas löscht oder entfernt. „Abbrechen“ hat den Fokus, Esc und ein Klick
// daneben brechen ab – gelöscht wird nur mit dem roten Knopf.
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { t } from '@/lib/i18n';

export default function ConfirmDialog({ title, text, confirmLabel, onCancel, onConfirm }: {
  title: string;
  text?: React.ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } };
    document.addEventListener('keydown', esc, true);
    return () => document.removeEventListener('keydown', esc, true);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onMouseDown={e => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="relative w-full max-w-sm rounded-2xl bg-[#1f1f1f] border border-white/10 shadow-2xl p-6 text-white">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        {text && <p className="mt-2 text-sm text-white/60">{text}</p>}
        <p className="mt-3 text-xs text-white/45">{t('Das kann nicht rückgängig gemacht werden.')}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="h-10 px-4 rounded-full text-sm font-medium hover:bg-white/10">{t('Abbrechen')}</button>
          <button onClick={onConfirm} className="h-10 px-5 rounded-full text-sm font-semibold bg-red-500 text-white hover:bg-red-400 transition-colors">
            {confirmLabel ?? t('Löschen')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
