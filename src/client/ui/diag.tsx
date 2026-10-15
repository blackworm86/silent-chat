import { useState } from 'preact/hooks';
import { config } from '../config';
import { t, Btn, Panel, Muted } from './common';
import type { Key } from '../i18n';

interface Step { k: Key; ok: boolean; msg?: string }

/** #/diag — lets you check the Firebase setup from your phone. */
export function Diag() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const run = async () => {
    setBusy(true); setDone(false);
    const out: Step[] = [];
    const push = (k: Key, ok: boolean, msg?: string) => { out.push({ k, ok, msg }); setSteps([...out]); };
    const cfg = config.value;
    const url = cfg.firebase?.databaseURL ?? '';
    if (cfg.transport !== 'firebase' || !url || /YOUR|XXXX/i.test(url)) { push('diagStepConfig', false, t('diagHintConfig')); setBusy(false); return; }
    push('diagStepConfig', true, url);
    try {
      const { makeBus } = await import('../bus/connect');
      const bus = await makeBus(cfg.firebase);
      push('diagStepConnect', true);
      const code = 'DIAG00';
      const t0 = performance.now();
      await bus.setMeta(code, { epoch: 'diag', hb: Date.now(), created: Date.now(), v: 1 });
      const m = await bus.getMeta(code);
      if (!m) throw new Error('read-back failed');
      push('diagStepWrite', true, `${Math.round(performance.now() - t0)} ms`);
      const got = await new Promise<boolean>((resolve) => {
        const un = bus.onHostQueue(code, (d, enc) => { un(); resolve(d === 'diag' && enc === 'ping'); });
        bus.pushToHost(code, 'diag', 'ping').catch(() => resolve(false));
        setTimeout(() => resolve(false), 8000);
      });
      push('diagStepQueue', got, got ? undefined : t('diagHintRules'));
      await bus.removeRoom(code).catch(() => {});
      setDone(got);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      const hint = /permission/i.test(msg) ? t('diagHintRules') : /url|database/i.test(msg) ? t('diagHintConfig') : `${msg} — ${t('diagHintNet')}`;
      push('diagStepConnect', false, hint);
    }
    setBusy(false);
  };

  return (
    <div class="page">
      <header class="topbar"><div class="phase">{t('diagTitle')}</div><a class="btn ghost small auto" href="#/">{t('back')}</a></header>
      <main class="main stack">
        <Muted>{t('diagIntro')}</Muted>
        <Btn disabled={busy} onClick={run}>{busy ? '…' : t('diagRun')}</Btn>
        <Panel>
          {steps.map((s, i) => <p key={i}>{s.ok ? '✅' : '❌'} <b>{t(s.k)}</b>{s.msg && <><br /><span class={s.ok ? 'muted' : 'warn'}>{s.msg}</span></>}</p>)}
          {done && <p class="ok"><b>{t('diagOk')}</b></p>}
        </Panel>
      </main>
    </div>
  );
}
