import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import type { ComponentChildren } from 'preact';
import { X } from 'lucide-preact';
import { lang, charName, fmtClock } from '../content';
import { dict, type Key } from '../i18n';
import { serverNow, view } from '../net';
import type { View } from '../../shared/types';
import { LENGTH_MS } from '../../shared/room';

export function t(key: Key, params?: Record<string, string | number>): string {
  let s: string = dict[lang.value][key] ?? dict.en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll('{' + k + '}', String(v));
  return s;
}

type BtnKind = 'primary' | 'ghost' | 'outline' | 'amber' | 'danger' | 'danger-ghost';
export function Btn(p: { onClick?: () => void; kind?: BtnKind; disabled?: boolean; children: ComponentChildren; small?: boolean; full?: boolean; label?: string; icon?: ComponentChildren }) {
  return (
    <button class={`btn ${p.kind ?? 'primary'} ${p.small ? 'small' : ''} ${p.full === false ? 'auto' : ''}`} disabled={p.disabled} onClick={p.onClick} aria-label={p.label}>
      {p.icon}{p.children}
    </button>
  );
}
/** Quiet secondary action: overrides, rare or destructive choices. */
export const TextLink = (p: { onClick: () => void; children: ComponentChildren; danger?: boolean }) =>
  <button class={`link ${p.danger ? 'danger' : ''}`} onClick={p.onClick}>{p.children}</button>;

export const Panel = (p: { children: ComponentChildren; amber?: boolean; class?: string }) => <div class={`panel ${p.amber ? 'accent' : ''} ${p.class ?? ''}`}>{p.children}</div>;
export const Section = (p: { title?: ComponentChildren; children: ComponentChildren }) => (
  <section class="section">{p.title && <div class="label">{p.title}</div>}{p.children}</section>
);
export const Label = (p: { children: ComponentChildren }) => <div class="label">{p.children}</div>;
export const Muted = (p: { children: ComponentChildren; small?: boolean }) => <p class={`muted ${p.small ? 'small' : ''}`}>{p.children}</p>;

export function ListRow(p: { icon?: ComponentChildren; children: ComponentChildren; sub?: ComponentChildren; onClick?: () => void; danger?: boolean; end?: ComponentChildren }) {
  const body = <>{p.icon && <span class="ic">{p.icon}</span>}<span class="grow">{p.children}{p.sub && <small>{p.sub}</small>}</span>{p.end}</>;
  return p.onClick
    ? <button class={`list-row ${p.danger ? 'danger' : ''}`} onClick={p.onClick}>{body}</button>
    : <div class={`list-row ${p.danger ? 'danger' : ''}`}>{body}</div>;
}

export function Switch(p: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children: ComponentChildren }) {
  return (
    <label class="switch-row"><span>{p.children}</span>
      <input class="switch" type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

/**
 * Fixed bottom bar for the screen's one primary action (thumb zone). It lives outside the screen's <Fit> (a portal),
 * so fitting never shrinks the buttons, and it publishes its height so the screen above knows how much room is left.
 */
export function ActionBar(p: { children: ComponentChildren; status?: ComponentChildren }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const set = () => root.style.setProperty('--ab-h', `${el.current?.offsetHeight ?? 0}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    if (el.current) ro?.observe(el.current);
    return () => { ro?.disconnect(); root.style.removeProperty('--ab-h'); };
  }, []);
  return createPortal(
    <div class="actionbar" ref={el}><div class="actionbar-in">
      {p.status !== undefined && <div class="status" aria-live="polite">{p.status}</div>}
      {p.children}
    </div></div>,
    document.body
  );
}

/**
 * Keeps its content on one screen: if it is taller than the room it has, it is zoomed down evenly (text, headings and
 * controls together) to a readable minimum; only past that minimum does it scroll, inside itself, never the page.
 */
const FIT_MIN = 0.74;
export function Fit({ children }: { children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current, i = inner.current;
    if (!b || !i) return;
    let busy = false;
    const fit = () => {
      if (busy) return; busy = true;
      (i.style as any).zoom = '1';
      const need = i.scrollHeight, have = b.clientHeight;
      const z = need > have && have > 0 ? Math.max(FIT_MIN, have / need) : 1;
      (i.style as any).zoom = String(z);
      b.classList.toggle('fit-scroll', need * z > have + 2);
      busy = false;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(b);
    const mo = new MutationObserver(() => requestAnimationFrame(fit));
    mo.observe(i, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'class'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return <div class="fit" ref={box}><div class="fit-in" ref={inner}>{children}</div></div>;
}
export const Waiting = (p: { children: ComponentChildren }) => <div class="waiting"><span class="pulse" aria-hidden="true" />{p.children}</div>;

const AVATAR = ['oklch(0.8 0.09 250)', 'oklch(0.8 0.11 30)', 'oklch(0.8 0.1 300)', 'oklch(0.82 0.11 155)', 'oklch(0.86 0.11 95)'];
export function Avatar({ seat, size = 36, byName }: { seat: number; size?: number; byName?: boolean }) {
  const v = view.value;
  const pl = v?.players.find((x) => x.seat === seat);
  const label = (!byName && pl?.characterId ? charName(pl.characterId) : pl?.name) || '?';
  return (
    <span class="avatar" style={{ width: `${size}px`, height: `${size}px`, background: AVATAR[seat % 5], fontSize: `${Math.round(size * 0.42)}px` }} aria-hidden="true">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Name shown for a seat: character name once chosen, else the player's own name. */
export function seatName(v: View, seat: number | null | undefined, identityAware = false): string {
  if (seat === null || seat === undefined) return '';
  const p = v.players.find((x) => x.seat === seat);
  if (!p) return '';
  if (identityAware && p.identity === 'alice') return 'Alice';
  return p.characterId ? charName(p.characterId) : p.name;
}

export function useNow(interval = 250): number {
  const [n, setN] = useState(serverNow());
  useEffect(() => { const i = setInterval(() => setN(serverNow()), interval); return () => clearInterval(i); }, [interval]);
  return n;
}
export function remainingMs(v: View, now: number): number {
  const c = v.clock;
  if (c.running) return Math.max(0, c.lengthMs - (now - c.startedAt));
  return c.pausedRemainingMs ?? c.lengthMs ?? LENGTH_MS;
}
export function useRemaining(): number {
  const now = useNow();
  const v = view.value;
  return v ? remainingMs(v, now) : LENGTH_MS;
}
export function Countdown({ until }: { until: number }) {
  const now = useNow(500);
  return <span class="num">{fmtClock(until - now)}</span>;
}

/** Bottom sheet. Closes on backdrop tap, the close button, or Escape. */
export function Modal(p: { title: string; onClose: () => void; children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(p.onClose); close.current = p.onClose;
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    const el = box.current;
    // focus the first field if the sheet has one (autoFocus), else the sheet itself
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus]') ?? el).focus({ preventScroll: true });
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close.current(); return; }
      if (e.key !== 'Tab' || !el) return;
      const f = [...el.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !(x as HTMLButtonElement).disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); back?.focus?.({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div class="sheet-back" onClick={p.onClose}>
      <div class="sheet" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head"><h2>{p.title}</h2><button class="icon-btn" aria-label={t('close')} onClick={p.onClose}><X size={22} /></button></div>
        <div class="sheet-body">{p.children}</div>
      </div>
    </div>,
    document.body
  );
}

/** In-app replacement for window.confirm (blocked or ugly in installed PWAs and in-app browsers). */
export function ConfirmSheet(p: { title: string; body: ComponentChildren; confirm: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={p.title} onClose={p.onClose}>
      <p class="muted">{p.body}</p>
      <div class="stack tight">
        <Btn kind={p.danger ? 'danger' : 'primary'} disabled={p.busy} onClick={p.onConfirm}>{p.confirm}</Btn>
        <Btn kind="ghost" onClick={p.onClose}>{t('cancel')}</Btn>
      </div>
    </Modal>
  );
}

/** In-app replacement for window.prompt. */
export function PromptSheet(p: { title: string; hint?: string; placeholder?: string; confirm: string; onSubmit: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const ok = () => { if (text.trim()) { p.onSubmit(text.trim()); p.onClose(); } };
  return (
    <Modal title={p.title} onClose={p.onClose}>
      {p.hint && <p class="muted small">{p.hint}</p>}
      <input class="input" autoFocus value={text} maxLength={120} placeholder={p.placeholder} onInput={(e) => setText((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      <Btn disabled={!text.trim()} onClick={ok}>{p.confirm}</Btn>
    </Modal>
  );
}

export function useLocalState<T>(key: string, init: T): [T, (v: T) => void] {
  const [s, set] = useState<T>(() => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : init; } catch { return init; } });
  return [s, (v: T) => { set(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }];
}

export const UnofficialTag = () => <span class="tag" title={t('unofficialHint')}>{t('unofficial')}</span>;
export const showUnofficial = () => lang.value === 'en';
