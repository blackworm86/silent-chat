import { useEffect } from 'preact/hooks';
import { FlaskConical, UserPlus, LogOut, Tablet } from 'lucide-preact';
import { view, fatal } from '../net';
import { t, Btn, Modal, Section, Switch, Muted, ListRow } from './common';
import { Shell, FatalScreen, Connecting, useWakeLock } from './shell';
import { TableBody } from './tableapp';
import { startDemo, stopDemo, viewAs, addBot, setDemoSpeed, nudgeBots, demoSeat, demoSeats, demoSpeed, demoAuto, demoSheet, TABLE } from '../demo';

const SPEEDS = [1, 10, 30, 60];

export function DemoRoom() {
  useEffect(() => {
    startDemo(localStorage.getItem('aim.name') || 'Host');
    return () => stopDemo();
  }, []);
  useWakeLock(true);
  const v = view.value;
  if (fatal.value) return <FatalScreen code={fatal.value} />;
  return (
    <>
      {!v ? <Connecting /> : demoSeat.value === TABLE ? <TableBody v={v} noSound /> : <Shell v={v} />}
      {/* phone screens carry the demo button in their top bar or play header; the table has none, so it floats */}
      {v && demoSeat.value === TABLE && (
        <button class="demo-pill" onClick={() => { demoSheet.value = true; }} aria-label={t('demoTitle')}>
          <FlaskConical size={14} aria-hidden="true" />{t('demoBadge')}
          <span class="demo-who">{demoSeat.value === TABLE ? t('demoTable') : demoSeats.value[demoSeat.value]?.name}</span>
        </button>
      )}
      {demoSheet.value && <DemoSheet onClose={() => { demoSheet.value = false; }} />}
    </>
  );
}

function DemoSheet({ onClose }: { onClose: () => void }) {
  const lobby = view.value?.phase === 'lobby';
  return (
    <Modal title={t('demoTitle')} onClose={onClose}>
      <Section title={t('demoViewAs')}>
        <div class="chips">
          <button class={`chip ${demoSeat.value === TABLE ? 'on' : ''}`} aria-pressed={demoSeat.value === TABLE} onClick={() => { viewAs(TABLE); onClose(); }}>
            <Tablet size={16} aria-hidden="true" />{t('demoTable')}
          </button>
          {demoSeats.value.map((s) => (
            <button key={s.seat} class={`chip ${demoSeat.value === s.seat ? 'on' : ''}`} aria-pressed={demoSeat.value === s.seat}
              onClick={() => { viewAs(s.seat); onClose(); }}>
              {s.seat === 0 ? `${s.name} (${t('demoYou')})` : s.name}
            </button>
          ))}
        </div>
        {lobby && demoSeats.value.length < 5 && <Btn kind="ghost" small icon={<UserPlus size={18} />} onClick={addBot}>{t('demoAddBot')}</Btn>}
      </Section>
      <Section title={t('demoSpeed')}>
        <div class="seg" role="group" aria-label={t('demoSpeed')}>
          {SPEEDS.map((x) => <button key={x} class={`num ${demoSpeed.value === x ? 'on' : ''}`} aria-pressed={demoSpeed.value === x} onClick={() => setDemoSpeed(x)}>{x}×</button>)}
        </div>
      </Section>
      <div class="stack tight">
        <Switch checked={demoAuto.value} onChange={(on) => { demoAuto.value = on; if (on) nudgeBots(); }}>{t('demoBots')}</Switch>
        <Muted small>{t('demoBotsHint')}</Muted>
      </div>
      <Muted small>{t('demoNote')}</Muted>
      <div class="list">
        <ListRow icon={<LogOut size={20} />} onClick={() => { location.hash = '#/'; }}>{t('demoLeave')}</ListRow>
      </div>
    </Modal>
  );
}
