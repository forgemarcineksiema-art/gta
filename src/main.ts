import './ui/styles.css';
import { App } from './app/App';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');

App.boot(canvas).catch((err: unknown) => {
  console.error('boot failed', err);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'FAILED TO START';
});
