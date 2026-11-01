import './style.css';
import { isTouchDevice } from './core/device';
import { Game } from './game/Game';
import { pwa } from './pwa/pwa';

if (isTouchDevice()) document.documentElement.classList.add('touch-ui');
pwa.init();
new Game().start();
