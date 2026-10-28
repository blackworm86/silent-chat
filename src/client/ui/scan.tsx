import { useEffect, useRef, useState } from 'preact/hooks';
import { X, CameraOff } from 'lucide-preact';
import { t, Btn } from './common';
import { inviteHashFrom } from '../scanparse';

export const canScan = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

type State = 'starting' | 'scanning' | 'denied' | 'wrong';

/** Full-screen camera that reads the table's QR code and walks straight into the game. Nothing is stored or sent. */
export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>('starting');
  const leave = () => { location.hash = '#/'; };

  useEffect(() => {
    let stop = false, stream: MediaStream | null = null, raf = 0, wrongTimer = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      } catch { if (!stop) setState('denied'); return; }
      if (stop) { stream.getTracks().forEach((x) => x.stop()); return; }
      const v = video.current!;
      v.srcObject = stream; v.setAttribute('playsinline', 'true');
      try { await v.play(); } catch { /* autoplay of a muted camera feed is allowed */ }
      setState('scanning');
      const detector = 'BarcodeDetector' in window ? new (window as any).BarcodeDetector({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      let last = 0;
      const tick = async (now: number) => {
        if (stop) return;
        raf = requestAnimationFrame(tick);
        if (now - last < 120 || v.readyState < 2 || !v.videoWidth) return;   // ~8 reads a second is plenty
        last = now;
        let text = '';
        try {
          if (detector) text = (await detector.detect(v))[0]?.rawValue ?? '';
          else {
            const w = Math.min(640, v.videoWidth), h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w; canvas.height = h; ctx.drawImage(v, 0, 0, w, h);
            text = jsQR!(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? '';
          }
        } catch { return; }
        if (!text || stop) return;
        const hash = inviteHashFrom(text, location.origin, location.pathname);
        if (hash) { stop = true; cancelAnimationFrame(raf); location.hash = hash; return; }
        setState('wrong'); clearTimeout(wrongTimer); wrongTimer = window.setTimeout(() => !stop && setState('scanning'), 1800);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => { stop = true; cancelAnimationFrame(raf); clearTimeout(wrongTimer); stream?.getTracks().forEach((x) => x.stop()); };
  }, []);

  if (state === 'denied') {
    return (
      <div class="scan scan-off">
        <div class="scan-top"><span class="brand">{t('scanTitle')}</span><button class="icon-btn" aria-label={t('close')} onClick={leave}><X size={22} /></button></div>
        <div class="scan-center stack center-text"><CameraOff size={44} class="faint" style={{ margin: '0 auto' }} /><h2>{t('scanDenied')}</h2><p class="muted">{t('scanDeniedHint')}</p></div>
        <div class="scan-bottom"><Btn onClick={leave}>{t('scanWrite')}</Btn></div>
      </div>
    );
  }
  return (
    <div class="scan">
      <video ref={video} muted playsInline class="scan-video" />
      <div class="scan-top"><span class="brand">{t('scanTitle')}</span><button class="icon-btn scan-x" aria-label={t('close')} onClick={leave}><X size={22} /></button></div>
      <div class={`scan-frame ${state === 'wrong' ? 'bad' : ''}`} aria-hidden="true"><i /><i /><i /><i /></div>
      <p class={`scan-msg ${state === 'wrong' ? 'bad' : ''}`} role="status" aria-live="polite">{state === 'wrong' ? t('scanWrong') : t('scanHint')}</p>
      <div class="scan-bottom"><Btn kind="ghost" onClick={leave}>{t('scanWrite')}</Btn></div>
    </div>
  );
}
