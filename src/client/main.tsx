import { render } from 'preact';
import { App } from './App';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/instrument-sans/wght.css';
import './styles.css';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
  navigator.serviceWorker?.register('sw.js').catch(() => { /* offline shell optional */ });
}
