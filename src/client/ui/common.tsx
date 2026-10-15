import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
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

export function Btn(p: { onClick?: () => void; kind?: 'primary' | 'ghost' | 'amber' | 'danger'; disabled?: boolean; children: ComponentChildren; small?: boolean; full?: boolean; label?: string }) {
  return (
    <button class={`btn ${p.kind ?? 'primary'} ${p.small ? 'small' : ''} ${p.full === false ? 'auto' : ''}`} disabled={p.disabled} onClick={p.onClick} aria-label={p.label}>
      {p.children}
    </button>
  );
}
export const Panel = (p: { children: ComponentChildren; amber?: boolean; class?: string }) => <div class={`panel ${p.amber ? 'amber' : ''} ${p.class ?? ''}`}>{p.children}</div>;
export const Label = (p: { children: ComponentChildren }) => <div class="label">{p.children}</div>;
export const Muted = (p: { children: ComponentChildren }) => <p class="muted">{p.children}</p>;

export function Avatar({ seat, size = 36 }: { seat: number; size?: number }) {
  const v = view.value;
  const pl = v?.players.find((x) => x.seat === seat);
  const label = pl?.characterId ? charName(pl.characterId) : pl?.name ?? '?';
  const colors = ['#8FB8FF', '#FF9F8A', '#C7A6FF', '#7FD6A0', '#F2D16B'];
  return (
    <span class="avatar" style={{ width: size, height: size, background: colors[seat % 5], fontSize: size * 0.45 }} aria-hidden="true">
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
  return <span class="mono">{fmtClock(until - now)}</span>;
}

export function Modal(p: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="modal-back" onClick={p.onClose}>
      <div class="modal" role="dialog" aria-label={p.title} onClick={(e) => e.stopPropagation()}>
        <div class="modal-head"><h2>{p.title}</h2><button class="icon-btn" aria-label={t('close')} onClick={p.onClose}>×</button></div>
        <div class="modal-body">{p.children}</div>
      </div>
    </div>
  );
}

export function useLocalState<T>(key: string, init: T): [T, (v: T) => void] {
  const [s, set] = useState<T>(() => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : init; } catch { return init; } });
  return [s, (v: T) => { set(v); try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }];
}

export const UnofficialTag = () => <span class="tag" title={t('unofficialHint')}>{t('unofficial')}</span>;
export const showUnofficial = () => lang.value === 'en';
