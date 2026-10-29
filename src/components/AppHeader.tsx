'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, Search, Plus, User, X, Map as MapIcon, LayoutGrid, ArrowLeft, ChevronDown, Heart, LogOut, Settings, LifeBuoy, Info, SquareUser as UserSquare } from 'lucide-react';
import { channelHref } from '@/lib/channels';
import { leaveWhilePlaying } from '@/lib/nav';
import { useRouteInteractions } from '@/lib/routeInteractions';
import type { RouteConfig } from '@/hooks/useEditorState';
import LogoLockup from '@/components/LogoLockup';
import NotificationBell from '@/components/NotificationBell';
import Onboarding from '@/components/Onboarding';
import SignupWall from '@/components/SignupWall';
import { requireAccount } from '@/lib/signupWall';
import { useAuth } from '@/lib/auth';

export const HEADER_HEIGHT = 56;

interface Props {
  routes: RouteConfig[];
  activeRouteId: string;
  onSelectRoute: (id: string) => void;
  onCreate: () => void;
  current?: 'map' | 'dashboard' | 'about' | 'other'; // highlights the matching drawer link
  showSearch?: boolean;          // the dashboard has its own search → no header search there
  sticky?: boolean;              // sticky inside a scrolling page instead of floating over the map
}

// YouTube-style top bar: menu + logo | search | create, notifications, account.
// Create / notifications / account are placeholders until accounts exist (see 07_TODO.md).
export default function AppHeader({ routes, activeRouteId, onSelectRoute, onCreate: onCreateRaw, current = 'map', showSearch: showSearchProp = true, sticky = false }: Props) {
  // creating a ride needs an account – visitors get the sign-up wall instead
  const onCreate = () => { if (requireAccount('create')) onCreateRaw(); };
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();
  // Signed out: no search, no notifications, no ride list; over the map the bar is transparent
  const showSearch = showSearchProp && !!user;
  const transparent = !user && !sticky;
  // Drawer groups (route lists) are collapsed by default
  const [routesOpen, setRoutesOpen] = useState(false);
  const [likedOpen, setLikedOpen] = useState(false);
  const { statsOf } = useRouteInteractions();
  const likedRoutes = routes.filter(r => statsOf(r.id).liked);
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [drawerOpen]);

  const select = (id: string) => {
    onSelectRoute(id);
    setDrawerOpen(false);
    setMobileSearch(false);
  };

  return (
    <>
      <header
        style={{ height: HEADER_HEIGHT }}
        className={`${sticky ? 'sticky' : 'absolute'} top-0 inset-x-0 z-[70] flex items-center gap-2 md:gap-4 px-2 md:px-4 transition-colors ${
          transparent ? 'bg-transparent border-b border-transparent' : 'bg-[#0f0f0f]/85 backdrop-blur-md border-b border-white/5'
        }`}
      >
        {mobileSearch ? (
          // Mobile: search takes over the whole bar
          <div className="flex items-center gap-2 w-full">
            <IconButton label="Zurück" onClick={() => setMobileSearch(false)}><ArrowLeft size={22} /></IconButton>
            <RouteSearch routes={routes} onSelect={select} autoFocus />
          </div>
        ) : (
          <>
            {/* Left: menu + logo */}
            <div className="flex items-center gap-1 md:gap-3 shrink-0">
              <IconButton label="Menü" onClick={() => setDrawerOpen(true)}><Menu size={22} /></IconButton>
              <Link href="/" className="flex items-center gap-2 pr-2" title="RouteCam – Startseite">
                <LogoLockup />
              </Link>
            </div>

            {/* Center: search (desktop) */}
            {showSearch ? (
              <>
                <div className="hidden md:flex flex-1 justify-center">
                  <div className="w-full max-w-[640px]">
                    <RouteSearch routes={routes} onSelect={select} />
                  </div>
                </div>
                <div className="flex-1 md:hidden" />
              </>
            ) : (
              <div className="flex-1" />
            )}

            {/* Right: actions */}
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              {showSearch && (
                <span className="md:hidden">
                  <IconButton label="Suchen" onClick={() => setMobileSearch(true)}><Search size={20} /></IconButton>
                </span>
              )}
              <button
                onClick={onCreate}
                className="hidden sm:inline-flex items-center gap-1.5 h-9 pl-3 pr-4 rounded-full bg-white/10 hover:bg-white/20 text-sm font-medium text-white transition-colors"
              >
                <Plus size={20} />
                Anlegen
              </button>
              <span className="sm:hidden">
                <IconButton label="Anlegen" onClick={onCreate}><Plus size={22} /></IconButton>
              </span>
              {user && <NotificationBell />}
              <AccountMenu />
            </div>
          </>
        )}

      </header>

      <Onboarding onCreate={onCreate} />
      <SignupWall />

      {/* Drawer (left side menu) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <nav className="absolute top-0 left-0 bottom-0 w-64 bg-[#0f0f0f] border-r border-white/5 flex flex-col">
            {/* Same spacing as the header's left section, so button and logo stay put when the drawer opens */}
            <div style={{ height: HEADER_HEIGHT }} className="flex items-center gap-1 md:gap-3 px-2 md:px-4 shrink-0">
              <IconButton label="Menü schließen" onClick={() => setDrawerOpen(false)}><X size={22} /></IconButton>
              <Link href="/" onClick={() => setDrawerOpen(false)} className="flex items-center gap-2 pr-2" title="RouteCam – Startseite">
                <LogoLockup />
              </Link>
            </div>
            {/* Groups: scroll together if the menu gets long */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-4">
              {/* Main navigation – always visible, not collapsible */}
              <div className="px-3 pt-2 flex flex-col gap-1">
                <DrawerLink href="/" icon={<MapIcon size={20} />} active={current === 'map'}>Karte</DrawerLink>
                {user && <DrawerLink href="/dashboard" icon={<LayoutGrid size={20} />} active={current === 'dashboard'}>Dashboard</DrawerLink>}
                <DrawerLink href="/about" icon={<Info size={20} />} active={current === 'about'}>About</DrawerLink>
              </div>

              {user && <div className="mx-3 my-2 border-t border-white/10" />}

              {user && <DrawerGroup title="Meine Routen" count={routes.length} open={routesOpen} onToggle={() => setRoutesOpen(o => !o)}>
                {routes.map(r => (
                  <RouteItem key={r.id} name={r.name} active={r.id === activeRouteId} onClick={() => select(r.id)} />
                ))}
              </DrawerGroup>}

              {user && <>
              <div className="mx-3 my-2 border-t border-white/10" />

              <DrawerGroup
                title="Gelikte Routen"
                icon={<Heart size={14} className="text-[#CCFF00]" fill="currentColor" />}
                count={likedRoutes.length}
                open={likedOpen}
                onToggle={() => setLikedOpen(o => !o)}
              >
                {likedRoutes.length === 0 ? (
                  <p className="pl-6 pr-3 py-2 text-xs text-white/40">Noch keine Route geliked – tippe im Community-Fenster aufs Herz.</p>
                ) : (
                  likedRoutes.map(r => (
                    <RouteItem key={r.id} name={r.name} active={r.id === activeRouteId} onClick={() => select(r.id)} />
                  ))
                )}
              </DrawerGroup>
              </>}
            </div>
            <div className="shrink-0 border-t border-white/10 px-6 py-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/40">
              <Link href="/about#impressum" onClick={leaveWhilePlaying} className="hover:text-white/80">Impressum</Link>
              <Link href="/about#datenschutz" onClick={leaveWhilePlaying} className="hover:text-white/80">Datenschutz</Link>
              <Link href="/about#agb" onClick={leaveWhilePlaying} className="hover:text-white/80">Nutzungsbedingungen</Link>
              <Link href="/about#kontakt" onClick={leaveWhilePlaying} className="hover:text-white/80">Kontakt</Link>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

// Avatar top right: "Sign in with Google" when signed out, profile + sign-out when signed in
function AccountMenu() {
  const { user, signOut, renderSignInButton, configured } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  // render Google's button when the menu opens while signed out
  useEffect(() => {
    if (!open || user || !configured || !btnRef.current) return;
    setError(null);
    renderSignInButton(btnRef.current).catch(e => setError(e.message));
  }, [open, user, configured, renderSignInButton]);

  // close the menu once the sign-in went through
  useEffect(() => { if (user) setOpen(false); }, [user]);

  return (
    <div ref={ref} className="relative ml-1">
      <button
        onClick={() => setOpen(o => !o)}
        title={user ? user.name : 'Anmelden'}
        aria-label={user ? `Konto: ${user.name}` : 'Anmelden'}
        className="w-8 h-8 rounded-full overflow-hidden bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors"
      >
        {user?.picture
          ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
          : user
            ? <span className="text-xs font-semibold">{user.name.slice(0, 1).toUpperCase()}</span>
            : <User size={18} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/10 bg-[#212121] shadow-2xl overflow-hidden">
          {user ? (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-white/10">
                {user.picture
                  ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-full" />
                  : <span className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-semibold">{user.name.slice(0, 1)}</span>}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{user.name}</div>
                  <div className="text-xs text-white/50 truncate">{user.email}</div>
                </div>
              </div>
              <div className="py-1.5">
                <MenuLink href={channelHref(user.id)} icon={<UserSquare size={16} />} onClick={() => setOpen(false)}>Mein Kanal</MenuLink>
                <MenuLink href="/dashboard" icon={<LayoutGrid size={16} />} onClick={() => setOpen(false)}>Dashboard</MenuLink>
                <MenuLink href="/settings" icon={<Settings size={16} />} onClick={() => setOpen(false)}>Einstellungen</MenuLink>
                <MenuLink href="/about#support" icon={<LifeBuoy size={16} />} onClick={() => setOpen(false)}>Support</MenuLink>
              </div>
              <div className="border-t border-white/10 py-1.5">
                <button onClick={() => { signOut(); setOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10">
                  <LogOut size={16} /> Abmelden
                </button>
              </div>
            </>
          ) : (
            <div className="p-4">
              <div className="text-sm font-semibold text-white">Bei RouteCam anmelden</div>
              <p className="text-xs text-white/50 mt-1 mb-4">Mit deinem Google-Konto – zum Anlegen, Liken und Kommentieren.</p>
              {configured ? (
                <div ref={btnRef} className="min-h-[44px] flex justify-center" />
              ) : (
                <p className="text-xs text-amber-300">Google-Login ist noch nicht eingerichtet: <code className="text-white/80">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> fehlt in <code className="text-white/80">.env.local</code>.</p>
              )}
              {error && <p className="text-xs text-red-300 mt-2">{error}</p>}
              <p className="text-[11px] leading-snug text-white/40 mt-4">
                Mit der Anmeldung akzeptierst du die{' '}
                <Link href="/about#agb" onClick={() => setOpen(false)} className="text-white/70 underline underline-offset-2 hover:text-white">Nutzungsbedingungen</Link>{' '}
                und hast die{' '}
                <Link href="/about#datenschutz" onClick={() => setOpen(false)} className="text-white/70 underline underline-offset-2 hover:text-white">Datenschutzerklärung</Link>{' '}
                gelesen.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon, onClick, children }: { href: string; icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={e => { onClick(); leaveWhilePlaying(e); }} className="flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10">
      {icon}
      {children}
    </Link>
  );
}

function DrawerGroup({ title, icon, count, open, onToggle, children }: {
  title: string; icon?: React.ReactNode; count?: number; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="px-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-3 h-10 rounded-lg flex items-center gap-2 text-sm font-medium text-white hover:bg-white/5"
      >
        {icon}
        <span>{title}</span>
        {count !== undefined && <span className="text-xs font-mono text-white/40">{count}</span>}
        <ChevronDown size={18} className={`ml-auto text-white/60 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

function RouteItem({ name, active, onClick }: { name: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-left pl-6 pr-3 h-10 shrink-0 rounded-lg text-sm truncate transition-colors ${
        active ? 'bg-white/10 text-white font-medium' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }`}
    >
      {name}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/10 active:bg-white/20 transition-colors"
    >
      {children}
    </button>
  );
}

function DrawerLink({ href, icon, active, children }: { href: string; icon: React.ReactNode; active?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={leaveWhilePlaying}
      className={`flex items-center gap-5 px-3 h-10 rounded-lg text-sm transition-colors ${
        active ? 'bg-white/10 text-white font-medium' : 'text-white/80 hover:bg-white/5'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}

// Search across route names and waypoint names; results drop down below the field.
function RouteSearch({ routes, onSelect, autoFocus }: { routes: RouteConfig[]; onSelect: (id: string) => void; autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return routes
      .map(r => {
        const place = r.cities.find(c => c.name.toLowerCase().includes(q) && !/^WP\d+$/.test(c.name));
        const nameHit = r.name.toLowerCase().includes(q);
        return nameHit || place ? { route: r, via: !nameHit && place ? place.name : undefined } : null;
      })
      .filter((x): x is { route: RouteConfig; via: string | undefined } => x !== null)
      .slice(0, 8);
  }, [query, routes]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const choose = (id: string) => {
    onSelect(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-1 flex items-center">
      <form
        className="flex flex-1 items-center"
        onSubmit={e => {
          e.preventDefault();
          if (results[highlight]) choose(results[highlight].route.id);
        }}
      >
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Routen und Orte suchen"
          className="flex-1 min-w-0 h-10 pl-4 pr-3 rounded-l-full bg-[#121212] border border-white/15 border-r-0 text-[15px] text-white placeholder:text-white/40 outline-none focus:border-[#CCFF00]/60"
        />
        <button
          type="submit"
          title="Suchen"
          className="h-10 w-16 rounded-r-full bg-white/[0.08] border border-white/15 hover:bg-white/15 flex items-center justify-center text-white transition-colors"
        >
          <Search size={20} />
        </button>
      </form>

      {open && query.trim() && (
        <div className="absolute left-0 right-16 top-full mt-1 rounded-xl bg-[#212121] border border-white/10 shadow-2xl py-2 overflow-hidden">
          {results.length === 0 ? (
            <div className="px-4 py-2 text-sm text-white/50">Keine Route gefunden</div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.route.id}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(r.route.id)}
                className={`w-full text-left px-4 py-2 flex items-center gap-3 text-sm ${i === highlight ? 'bg-white/10' : ''}`}
              >
                <Search size={16} className="text-white/40 shrink-0" />
                <span className="truncate text-white">{r.route.name}</span>
                {r.via && <span className="truncate text-xs text-white/40">über {r.via}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
