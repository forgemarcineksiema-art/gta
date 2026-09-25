import './ui/styles.css';
import { App } from './app/App';
import { t } from './ui/lang';
import { applyHudScale } from './ui/scale';

// the screen's one scale before anything is laid out (M8.9 R3): the root's font size follows the window's height
applyHudScale();

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');

App.boot(canvas).catch((err: unknown) => {
  console.error('boot failed', err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = t('FAILED TO START');
});
