import './style.css';
import { BIKES, newBike, stepBike, type BikeSpec, type BikeState } from './physics';
import { GameRenderer } from './render';

type Screen = 'menu' | 'garage' | 'play' | 'pause' | 'crash';
interface SaveData { coins: number; best: number; owned: string[]; selected: string }
const SAVE_KEY = 'bens-bike-trip-v1';
const $ = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element: ${id}`);
  return element as T;
};

function loadSave(): SaveData {
  try {
    const data: Partial<SaveData> = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return {
      coins: Number.isFinite(data.coins) ? Math.max(0, data.coins!) : 0,
      best: Number.isFinite(data.best) ? Math.max(0, data.best!) : 0,
      owned: Array.isArray(data.owned) ? [...new Set(['trail', ...data.owned.filter(id => BIKES.some(b => b.id === id))])] : ['trail'],
      selected: BIKES.some(b => b.id === data.selected) ? data.selected! : 'trail',
    };
  } catch { return { coins: 0, best: 0, owned: ['trail'], selected: 'trail' }; }
}

let save = loadSave();
if (!save.owned.includes(save.selected)) save.selected = 'trail';
function persist(): void { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private browsing */ } }
let screen: Screen = 'menu';
let bike: BikeState = newBike();
let spec: BikeSpec = BIKES.find(b => b.id === save.selected)!;
const renderer = new GameRenderer($<HTMLCanvasElement>('world'));
const keyDown = new Set<string>();
let touchLeft = false;
let touchRight = false;
let touchBoost = false;
let toastUntil = 0;
let lastTime = 0;
let accumulator = 0;
let hudTick = 0;
let gameTime = 0;

const screens: Record<string, HTMLElement> = {
  menu: $('menu'), garage: $('garage-screen'), hud: $('hud'), pause: $('pause-screen'), crash: $('crash-screen'),
};
function show(next: Screen): void {
  screen = next;
  for (const [name, node] of Object.entries(screens)) {
    const visible = name === next || (name === 'hud' && (next === 'play' || next === 'pause'));
    node.classList.toggle('hidden', !visible);
  }
  if (next === 'menu') {
    $('menu-best').textContent = `${save.best.toLocaleString()} m`;
    $('menu-coins').innerHTML = `${save.coins.toLocaleString()} <small>◈</small>`;
    bike = newBike();
  }
  if (next === 'garage') renderGarage();
  if (next !== 'play') resetControls();
}
function resetControls(): void { touchLeft = touchRight = touchBoost = false; keyDown.clear(); }
function ride(): void {
  spec = BIKES.find(b => b.id === save.selected) ?? BIKES[0];
  bike = newBike(spec.wheelScale);
  accumulator = 0;
  gameTime = 0;
  show('play');
}
function crash(): void {
  // Distance bonus is kept even if all collectible coins were missed.
  const distanceBonus = Math.floor(bike.distance / 100);
  const earned = bike.totalCoins + distanceBonus;
  const newBest = bike.distance > save.best;
  save.coins += earned;
  save.best = Math.max(save.best, bike.distance);
  persist();
  $('final-distance').textContent = bike.distance.toLocaleString();
  $('final-coins').textContent = earned.toLocaleString();
  $('record-label').classList.toggle('hidden', !newBest);
  show('crash');
}
function renderGarage(): void {
  $('bike-list').innerHTML = BIKES.map(b => {
    const owned = save.owned.includes(b.id);
    const selected = save.selected === b.id;
    const affordable = save.coins >= b.price;
    const button = selected ? 'EQUIPPED ✓' : owned ? 'EQUIP BIKE' : affordable ? `UNLOCK ◈ ${b.price}` : `◈ ${b.price}`;
    return `<article class="bike-card ${selected ? 'selected' : ''}">
      <div class="bike-icon" style="--bike-color:${b.color}">${b.icon}</div>
      <div class="bike-desc"><h3>${b.name}</h3><p>${b.subtitle}</p><div class="bike-stats"><span>SPEED <b>${Math.round(b.power * 100)}%</b></span><span>HANDLING <b>${Math.round(b.handling * 100)}%</b></span></div></div>
      <button class="bike-buy" data-bike="${b.id}" ${selected || (!owned && !affordable) ? 'disabled' : ''}>${button}</button>
    </article>`;
  }).join('');
  $('garage-footnote').textContent = `◈ ${save.coins.toLocaleString()} COINS AVAILABLE · Your purchases save on this device.`;
}

$('play').addEventListener('click', ride);
$('retry').addEventListener('click', ride);
$('garage').addEventListener('click', () => show('garage'));
$('garage-back').addEventListener('click', () => show('menu'));
$('crash-menu').addEventListener('click', () => show('menu'));
$('quit').addEventListener('click', () => show('menu'));
$('resume').addEventListener('click', () => show('play'));
$('pause').addEventListener('click', () => show(screen === 'pause' ? 'play' : 'pause'));
$('bike-list').addEventListener('click', event => {
  const element = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-bike]');
  if (!element) return;
  const found = BIKES.find(b => b.id === element.dataset.bike);
  if (!found) return;
  if (save.owned.includes(found.id)) save.selected = found.id;
  else if (save.coins >= found.price) {
    save.coins -= found.price;
    save.owned.push(found.id);
    save.selected = found.id;
  } else return;
  spec = found;
  persist();
  renderGarage();
});

function bindHold(button: HTMLElement, setter: (on: boolean) => void): void {
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    setter(true);
    button.setPointerCapture(event.pointerId);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(name, () => setter(false));
  button.addEventListener('contextmenu', event => event.preventDefault());
}
bindHold($('lean-left'), value => { touchLeft = value; });
bindHold($('lean-right'), value => { touchRight = value; });
bindHold($('boost'), value => { touchBoost = value; });
window.addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'Escape'].includes(event.code)) event.preventDefault();
  if (event.code === 'Escape') {
    if (screen === 'play') show('pause');
    else if (screen === 'pause') show('play');
    else if (screen === 'garage') show('menu');
    return;
  }
  if (event.code === 'Enter' && screen === 'menu') ride();
  keyDown.add(event.code);
});
window.addEventListener('keyup', event => keyDown.delete(event.code));
window.addEventListener('blur', () => { resetControls(); if (screen === 'play') show('pause'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') show('pause'); });
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('orientationchange', () => renderer.resize());

function hudUpdate(): void {
  $('distance').textContent = bike.distance.toLocaleString();
  $('best').textContent = Math.max(bike.distance, save.best).toLocaleString();
  $('run-coins').textContent = bike.totalCoins.toLocaleString();
  $('boost-fill').style.width = `${Math.round(bike.boost)}%`;
  $('boost-label').textContent = `${Math.round(bike.boost)}%`;
}

function frame(time: number): void {
  if (!lastTime) lastTime = time;
  const elapsed = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  if (screen === 'play') {
    gameTime += elapsed;
    accumulator += elapsed;
    let loops = 0;
    while (accumulator >= 1 / 120 && loops++ < 8) {
      const back = touchLeft || keyDown.has('KeyA') || keyDown.has('ArrowLeft');
      const forward = touchRight || keyDown.has('KeyD') || keyDown.has('ArrowRight');
      const turbo = touchBoost || keyDown.has('Space') || keyDown.has('ArrowUp');
      const outcome = stepBike(bike, spec, 1 / 120, Number(forward) - Number(back), turbo);
      if (outcome.launch) {
        $('stunt').textContent = 'BIG AIR!';
        $('stunt').classList.remove('hidden');
        toastUntil = gameTime + 0.8;
      }
      if (outcome.flip) {
        $('stunt').textContent = outcome.flip === 1 ? 'FULL FLIP!  +30 ◈' : `${outcome.flip}x FLIP COMBO!  +${outcome.flip * 30} ◈`;
        $('stunt').classList.remove('hidden');
        toastUntil = gameTime + 1.65;
      }
      if (outcome.crashed) { crash(); break; }
      accumulator -= 1 / 120;
    }
    if (gameTime > toastUntil) $('stunt').classList.add('hidden');
    hudTick += elapsed;
    if (hudTick > 0.06) { hudUpdate(); hudTick = 0; }
  }
  renderer.frame(bike, spec, elapsed, screen === 'play' || screen === 'pause' || screen === 'crash');
  requestAnimationFrame(frame);
}
show('menu');
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}
