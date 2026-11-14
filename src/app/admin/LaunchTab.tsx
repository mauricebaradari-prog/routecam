'use client';

// Admin → Launchliste: the founder's own to-do list for the launch.
//
// Lives in the table public.launch_todos (supabase/migrations/0006_launch_todos.sql). Only the
// founder account can read or change it – for everyone else the table is empty and writes fail.
// Changes are shown at once and saved in the background; if saving fails the row goes back.
//
// Same look as the rest of the admin board: light and plain, black = primary.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, Eye, ArrowDownWideNarrow, X, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Todo {
  id: string; section: string; ord: number; text: string; done: boolean; done_at: string | null;
  priority: 'high' | 'medium' | 'low' | null; read: boolean; later: boolean; created_at: string;
}

// Order of the sections on the page. Unknown sections from the database are shown after these.
const SECTIONS: { key: string; label: string; hint?: string; prefix: string }[] = [
  { key: 'infra', label: 'Launch · Infrastruktur', hint: 'Damit Daten, Konten und Domain echt funktionieren.', prefix: 'infra' },
  { key: 'login', label: 'Launch · Google-Login', prefix: 'login' },
  { key: 'pflicht', label: 'Launch · Pflicht, auch kostenlos', hint: 'Gilt ab dem ersten öffentlichen Nutzer, unabhängig von Einnahmen.', prefix: 'pflicht' },
  { key: 'cleanup', label: 'Aufräumen vor dem Launch', prefix: 'cleanup' },
  { key: 'test', label: 'Testen', prefix: 'test' },
  { key: 'social', label: 'Social Media', hint: 'Kanäle, Inhalte und Posts rund um den Launch.', prefix: 'social' },
  { key: 'tracker', label: 'Tracker-App', hint: 'Die GPS-Tracker-App fürs Handy.', prefix: 'tracker' },
  { key: 'features', label: 'Features nach dem Launch', prefix: 'feat' },
  { key: 'spaeter', label: 'Später · bei Monetarisierung oder Verkauf', prefix: 'spaet' },
];

const PRIOS = [
  { value: '', label: 'Prio' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;
const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const PRIO_STYLE: Record<string, string> = {
  '': 'border-dashed border-neutral-300 adark:border-neutral-700 text-neutral-400 adark:text-neutral-500',
  high: 'border-red-300 adark:border-red-900 bg-red-50 adark:bg-red-950/40 text-red-700 adark:text-red-400',
  medium: 'border-amber-300 adark:border-amber-900 bg-amber-50 adark:bg-amber-950/40 text-amber-800 adark:text-amber-400',
  low: 'border-sky-300 adark:border-sky-900 bg-sky-50 adark:bg-sky-950/40 text-sky-800 adark:text-sky-400',
};

type Filter = 'open' | 'all' | 'later';
const FILTER_KEY = 'routecam.adminLaunchFilter';
const SORT_KEY = 'routecam.adminLaunchSortPrio';
const UNDO_MS = 10_000;

const btnSecondary = 'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-white adark:bg-neutral-900 text-black adark:text-white border border-neutral-300 adark:border-neutral-700 text-sm hover:bg-neutral-100 adark:hover:bg-neutral-800 disabled:opacity-40 transition-colors';
const iconBtn = 'shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-md transition-colors';

// `code` in the text is shown as code
function Rich({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return <>{parts.map((p, i) => p.startsWith('`') && p.endsWith('`') && p.length > 1
    ? <code key={i} className="font-mono text-[12.5px] px-1 py-0.5 rounded bg-neutral-100 adark:bg-neutral-800 text-neutral-700 adark:text-neutral-300">{p.slice(1, -1)}</code>
    : <React.Fragment key={i}>{p}</React.Fragment>)}</>;
}

export default function LaunchTab({ reloadKey }: { reloadKey: number }) {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('open');
  const [sortPrio, setSortPrio] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ todo: Todo } | null>(null);
  const [undoLeft, setUndoLeft] = useState(UNDO_MS);

  // remembered view settings
  useEffect(() => {
    try {
      const f = localStorage.getItem(FILTER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- saved view settings are only known in the browser
      if (f === 'open' || f === 'all' || f === 'later') setFilter(f);
      setSortPrio(localStorage.getItem(SORT_KEY) === '1');
    } catch {}
  }, []);
  const chooseFilter = (f: Filter) => { setFilter(f); try { localStorage.setItem(FILTER_KEY, f); } catch {} };
  const toggleSort = () => setSortPrio(s => { try { localStorage.setItem(SORT_KEY, s ? '0' : '1'); } catch {} return !s; });

  const load = useCallback(async () => {
    const { data, error } = await supabase().from('launch_todos').select('*').order('ord');
    if (error) setError(`Laden hat nicht geklappt: ${error.message}`);
    else { setError(''); setTodos(data as Todo[]); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data comes from the database
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => clearInterval(t);
  }, [load, reloadKey]);

  // change one row at once, save in the background, put it back if saving fails
  const patch = useCallback(async (todo: Todo, changes: Partial<Todo>) => {
    setTodos(ts => ts?.map(t => t.id === todo.id ? { ...t, ...changes } : t) ?? ts);
    const { error } = await supabase().from('launch_todos').update(changes).eq('id', todo.id);
    if (error) {
      setTodos(ts => ts?.map(t => t.id === todo.id ? todo : t) ?? ts);
      setError(`Nicht gespeichert: ${error.message}`);
    }
  }, []);

  const toggleDone = (todo: Todo) => {
    const done = !todo.done;
    patch(todo, { done, done_at: done ? new Date().toISOString() : null });
    setUndo(done ? { todo } : null);
  };

  // undo toast: countdown, then it disappears
  useEffect(() => {
    if (!undo) return;
    const until = Date.now() + UNDO_MS;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- countdown starts with each new toast
    setUndoLeft(UNDO_MS);
    const t = setInterval(() => {
      const left = until - Date.now();
      setUndoLeft(Math.max(0, left));
      if (left <= 0) setUndo(null);
    }, 100);
    return () => clearInterval(t);
  }, [undo]);

  const remove = async (todo: Todo) => {
    setConfirmDelete(null);
    setTodos(ts => ts?.filter(t => t.id !== todo.id) ?? ts);
    const { error } = await supabase().from('launch_todos').delete().eq('id', todo.id);
    if (error) { setError(`Löschen hat nicht geklappt: ${error.message}`); load(); }
  };

  const add = async (sectionKey: string, text: string) => {
    if (!todos) return;
    const meta = SECTIONS.find(s => s.key === sectionKey);
    const prefix = meta?.prefix ?? sectionKey;
    const nums = todos.filter(t => t.id.startsWith(prefix + '-')).map(t => parseInt(t.id.slice(prefix.length + 1), 10)).filter(n => !isNaN(n));
    const id = `${prefix}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(2, '0')}`;
    const ord = Math.max(0, ...todos.filter(t => t.section === sectionKey).map(t => Number(t.ord))) + 10;
    const row: Todo = { id, section: sectionKey, ord, text, done: false, done_at: null, priority: null, read: false, later: false, created_at: new Date().toISOString() };
    setTodos(ts => ts ? [...ts, row] : ts);
    const { error } = await supabase().from('launch_todos').insert({ id, section: sectionKey, ord, text });
    if (error) { setError(`Hinzufügen hat nicht geklappt: ${error.message}`); load(); }
  };

  const total = todos?.length ?? 0;
  const doneCount = todos?.filter(t => t.done).length ?? 0;
  const laterOpen = todos?.filter(t => t.later && !t.done).length ?? 0;

  const sections = useMemo(() => {
    const extra = [...new Set((todos ?? []).map(t => t.section))].filter(k => !SECTIONS.some(s => s.key === k))
      .map(k => ({ key: k, label: k, prefix: k } as (typeof SECTIONS)[number]));
    return [...SECTIONS, ...extra].map(meta => {
      const items = (todos ?? []).filter(t => t.section === meta.key)
        .sort((a, b) => (sortPrio ? (PRIO_RANK[a.priority ?? ''] ?? 3) - (PRIO_RANK[b.priority ?? ''] ?? 3) : 0) || Number(a.ord) - Number(b.ord));
      const shown = filter === 'open' ? items.filter(t => !t.done) : filter === 'later' ? items.filter(t => t.later && !t.done) : items;
      return { meta, items, shown, open: items.filter(t => !t.done).length };
    });
  }, [todos, filter, sortPrio]);

  return (
    <div className="max-w-4xl">
      {/* summary + view controls */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">Launchliste</h2>
          <span className="font-mono tabular-nums text-sm text-neutral-500 adark:text-neutral-400">
            <span className="text-neutral-900 adark:text-neutral-100">{doneCount}</span> / {total} erledigt
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-200 adark:bg-neutral-800 overflow-hidden" aria-hidden="true">
          <div className="h-full bg-black adark:bg-white transition-[width] duration-500" style={{ width: total ? `${(doneCount / total) * 100}%` : 0 }} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-0.5 rounded-lg border border-neutral-300 adark:border-neutral-700 bg-white adark:bg-neutral-900">
            {([['open', 'Offen'], ['all', 'Alle'], ['later', laterOpen ? `Gemerkt · ${laterOpen}` : 'Gemerkt']] as const).map(([id, label]) => (
              <button key={id} onClick={() => chooseFilter(id)}
                className={`h-8 px-3 rounded-md text-sm transition-colors ${filter === id ? 'bg-black adark:bg-white text-white adark:text-black' : 'text-neutral-600 adark:text-neutral-400 hover:text-black adark:hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={toggleSort} aria-pressed={sortPrio}
            title={sortPrio ? 'Sortierung nach Wichtigkeit aufheben' : 'In jedem Abschnitt nach Wichtigkeit sortieren (High → Medium → Low → ohne)'}
            className={`${btnSecondary} ${sortPrio ? '!border-black adark:!border-white font-medium' : ''}`}>
            <ArrowDownWideNarrow size={15} /> Nach Prio {sortPrio && <X size={13} className="-mr-1" />}
          </button>
        </div>
        {error && <p className="text-sm text-red-700 adark:text-red-400">{error}</p>}
      </div>

      {todos === null && !error && <p className="text-sm text-neutral-500 adark:text-neutral-400 py-10">Die Liste lädt …</p>}

      {todos && (
        <div className="flex flex-col gap-10">
          {sections.map(({ meta, items, shown, open }) => {
            if (filter === 'later' && !shown.length) return null;
            return (
              <section key={meta.key} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h3 className="text-xs font-semibold uppercase tracking-wider">{meta.label}</h3>
                  <span className="font-mono tabular-nums text-xs text-neutral-500 adark:text-neutral-400">
                    {items.length ? (open ? `${open} offen` : 'alles erledigt') : 'leer'}
                  </span>
                  {meta.hint && <span className="basis-full text-[13px] text-neutral-500 adark:text-neutral-400">{meta.hint}</span>}
                </div>

                {shown.length > 0 && (
                  <ul className="border-t border-neutral-200 adark:border-neutral-800">
                    {shown.map(t => (
                      <li key={t.id} className={`flex items-start gap-3 py-2.5 pl-1 pr-0.5 border-b border-neutral-200 adark:border-neutral-800 ${t.later && !t.done ? 'shadow-[inset_2px_0_0_#f59e0b] pl-3' : ''}`}>
                        <input
                          id={`todo-${t.id}`} type="checkbox" checked={t.done} onChange={() => toggleDone(t)}
                          className="mt-[3px] w-[18px] h-[18px] shrink-0 accent-black adark:accent-white cursor-pointer"
                        />
                        <label htmlFor={`todo-${t.id}`} className={`flex-1 min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] cursor-pointer ${t.done ? 'text-neutral-400 adark:text-neutral-500 line-through' : ''}`}>
                          <Rich text={t.text} />
                        </label>

                        {confirmDelete === t.id ? (
                          <div className="shrink-0 flex items-center gap-1.5">
                            <span className="text-xs text-neutral-500 adark:text-neutral-400 hidden sm:inline">Löschen?</span>
                            <button onClick={() => remove(t)} className="h-8 px-3 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700">Löschen</button>
                            <button onClick={() => setConfirmDelete(null)} className="h-8 px-3 rounded-md border border-neutral-300 adark:border-neutral-700 text-xs hover:bg-neutral-100 adark:hover:bg-neutral-800">Abbrechen</button>
                          </div>
                        ) : (
                          <div className="shrink-0 flex items-center gap-0.5">
                            <select
                              value={t.priority ?? ''} onChange={e => patch(t, { priority: (e.target.value || null) as Todo['priority'] })}
                              aria-label={`Wichtigkeit: ${t.text}`}
                              className={`appearance-none cursor-pointer h-7 min-w-[68px] px-2.5 mr-1 rounded-full border text-[11px] font-mono font-medium uppercase tracking-wide text-center ${PRIO_STYLE[t.priority ?? '']} ${t.done ? 'opacity-50' : ''}`}
                            >
                              {PRIOS.map(p => <option key={p.value} value={p.value} className="bg-white adark:bg-neutral-900 text-neutral-900 adark:text-neutral-100 normal-case">{p.label}</option>)}
                            </select>
                            <button onClick={() => patch(t, { later: !t.later })} aria-pressed={t.later}
                              title={t.later ? 'Gemerkt für später – klicken zum Entfernen' : 'Für später merken'}
                              className={`${iconBtn} ${t.later ? 'text-amber-600 adark:text-amber-400' : 'text-neutral-400 adark:text-neutral-600 hover:text-black adark:hover:text-white'}`}>
                              <Bookmark size={16} fill={t.later ? 'currentColor' : 'none'} />
                            </button>
                            <button onClick={() => patch(t, { read: !t.read })} aria-pressed={t.read}
                              title={t.read ? 'Gelesen – klicken zum Zurücksetzen' : 'Als gelesen markieren'}
                              className={`${iconBtn} ${t.read ? 'text-black adark:text-white' : 'text-neutral-400 adark:text-neutral-600 hover:text-black adark:hover:text-white'}`}>
                              <Eye size={16} strokeWidth={t.read ? 2.4 : 2} />
                            </button>
                            <button onClick={() => setConfirmDelete(t.id)} title="Löschen" aria-label={`Löschen: ${t.text}`}
                              className={`${iconBtn} text-neutral-400 adark:text-neutral-600 hover:text-red-600 adark:hover:text-red-400`}>
                              <X size={16} />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <AddForm sectionKey={meta.key} onAdd={add} />
              </section>
            );
          })}
        </div>
      )}

      {/* after ticking off: undo for 10 s */}
      {undo && (
        <div role="status" className="fixed z-30 left-1/2 -translate-x-1/2 bottom-[calc(20px+env(safe-area-inset-bottom,0px))] w-[min(520px,calc(100vw-32px))] flex items-center gap-3 pl-4 pr-2 py-2 rounded-xl bg-black adark:bg-white text-white adark:text-black shadow-lg">
          <span className="relative w-7 h-7 shrink-0" aria-hidden="true">
            <svg viewBox="0 0 36 36" className="w-7 h-7 -rotate-90">
              <circle cx="18" cy="18" r="15.9" pathLength={100} fill="none" strokeWidth="2.5" className="stroke-white/20 adark:stroke-black/15" />
              <circle cx="18" cy="18" r="15.9" pathLength={100} fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-white adark:stroke-black"
                strokeDasharray={`${(undoLeft / UNDO_MS) * 100} 100`} />
            </svg>
            <span className="absolute inset-0 grid place-items-center font-mono tabular-nums text-[11px]">{Math.ceil(undoLeft / 1000)}</span>
          </span>
          <span className="flex-1 min-w-0 text-sm">
            <span className="flex items-center gap-1.5"><Check size={14} /> Abgehakt</span>
            <span className="block text-xs opacity-60 truncate">{undo.todo.text.replace(/`/g, '')}</span>
          </span>
          <button onClick={() => { patch({ ...undo.todo, done: true }, { done: false, done_at: null }); setUndo(null); }}
            className="shrink-0 h-8 px-3 rounded-lg bg-white adark:bg-black text-black adark:text-white text-sm font-medium hover:opacity-90">
            Rückgängig
          </button>
        </div>
      )}
    </div>
  );
}

function AddForm({ sectionKey, onAdd }: { sectionKey: string; onAdd: (section: string, text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form className="flex gap-2 mt-1" onSubmit={e => { e.preventDefault(); const v = text.trim(); if (v) { onAdd(sectionKey, v); setText(''); } }}>
      <input
        id={`add-${sectionKey}`} value={text} onChange={e => setText(e.target.value)} placeholder="Neuer Punkt …" autoComplete="off"
        className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-neutral-300 adark:border-neutral-700 bg-white adark:bg-neutral-900 text-sm placeholder:text-neutral-400 focus:outline-none focus:border-black adark:focus:border-white"
      />
      <button type="submit" disabled={!text.trim()} className={btnSecondary}>Hinzufügen</button>
    </form>
  );
}
