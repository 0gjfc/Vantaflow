// Itemzflow-style coverflow, rebuilt with CSS 3D.
//
// Geometry follows Itemzflow's GLES2 renderer (GLES2_itemzflow.cpp, DrawScene_4):
//   - camera at origin, vertical FOV 60°, covers placed at z = -3.6 units
//   - 7 pieces drawn (selected ± 3), spaced 1.05 units on x
//   - each step rotates the cover 30° on Y (90° / 3), so the outermost is edge-on
//   - covers are 1 × 1.25 units and stand on a "floor" at the screen's vertical centre
//   - one step animates in 0.1976 s; reflections are mirrored below the floor
// 1 unit = 1080 / (2 · 3.6 · tan 30°) ≈ 260 px at 1080p, so CSS perspective = 3.6 units.
import { coverHTML } from './art.js';

export const BASE_UNIT = 260;
const RANGE = 3;
const STEP_DEG = 30;
const SPACING = 1.05;

export const mod = (k, n) => ((k % n) + n) % n;

export class Coverflow {
  // config() → { wrap, unitScale, stepSeconds }
  constructor(root, { config, onChange, onSelect }) {
    Object.assign(this, { root, config, onChange, onSelect });
    this.row = document.createElement('div');
    this.row.className = 'cf-row';
    root.append(this.row);
    this.items = [];
    this.pool = new Map(); // absolute slot k → element (k is unbounded so wrap-around duplicates work)
    this.target = 0;
    this.pos = 0;
    this.raf = 0;
    this.tick = this.tick.bind(this);

    root.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.page) this.move(Math.sign(e.deltaY || e.deltaX));
    }, { passive: false });
    this.row.addEventListener('click', (e) => {
      const el = e.target.closest('.cf-item');
      if (!el || this.page) return;
      const k = Number(el.dataset.k);
      if (k === this.target) this.onSelect?.(this.current);
      else this.go(k);
    });
  }

  get n() { return this.items.length; }
  get index() { return this.n ? mod(this.target, this.n) : -1; }
  get current() { return this.items[this.index]; }

  setItems(items, shape, keepId) {
    this.items = items;
    this.shape = shape;
    this.root.dataset.shape = shape;
    const i = items.findIndex((x) => x.id === keepId);
    this.target = this.pos = Math.max(0, i);
    this.refresh();
    this.onChange?.(this.current);
  }

  // Rebuild visible covers (after a settings change or favourite toggle).
  refresh() {
    const { wrap, unitScale } = this.config();
    if (!wrap) this.target = this.pos = Math.max(0, this.index);
    this.root.style.setProperty('--u', `${BASE_UNIT * unitScale}px`);
    for (const el of this.pool.values()) el.remove();
    this.pool.clear();
    this.render();
  }

  go(k) {
    if (!this.n) return false;
    if (!this.config().wrap) k = Math.max(0, Math.min(this.n - 1, k));
    if (k === this.target) return false;
    this.target = k;
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
    this.onChange?.(this.current);
    return true;
  }

  move(dir) { return this.go(this.target + dir); }

  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const diff = this.target - this.pos;
    const dur = this.config().stepSeconds;
    // Linear like Itemzflow; if input outruns the animation, speed up instead of queueing.
    const step = dur > 0 ? (dt / dur) * Math.max(1, Math.abs(diff)) : Infinity;
    this.pos = Math.abs(diff) <= step ? this.target : this.pos + Math.sign(diff) * step;
    this.render();
    this.raf = this.pos === this.target ? 0 : requestAnimationFrame(this.tick);
  }

  render() {
    const { wrap, unitScale } = this.config();
    const u = BASE_UNIT * unitScale;
    const live = new Set();
    for (let k = Math.floor(this.pos) - RANGE; k <= Math.ceil(this.pos) + RANGE; k++) {
      const d = k - this.pos;
      if (!this.n || Math.abs(d) >= RANGE || (!wrap && (k < 0 || k >= this.n))) continue;
      live.add(k);
      let el = this.pool.get(k);
      if (!el) {
        el = this.make(this.items[mod(k, this.n)], k);
        this.pool.set(k, el);
        this.row.append(el);
      }
      el.style.transform = `translate3d(${d * SPACING * u}px,0,0) rotateY(${-d * STEP_DEG}deg)`;
      el.classList.toggle('is-current', k === this.target);
    }
    for (const [k, el] of this.pool) if (!live.has(k)) { el.remove(); this.pool.delete(k); }
  }

  make(item, k) {
    const el = document.createElement('div');
    el.className = `cf-item${item.fav ? ' fav' : ''}`;
    el.dataset.k = k;
    const face = coverHTML(item, this.shape);
    el.innerHTML = `<div class="cf-spin"><div class="cf-face">${face}</div><div class="cf-reflect" aria-hidden="true">${face}</div></div>`;
    return el;
  }

  // Game page: camera moves like Itemzflow's ITEM_PAGE view (.70, -.55, 1.85) and the cover backflips.
  setPage(on) {
    this.page = on;
    this.root.classList.toggle('page-mode', on);
    const spin = this.pool.get(this.target)?.querySelector('.cf-spin');
    const ms = this.config().stepSeconds * 2000;
    if (spin && ms) spin.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], { duration: ms, easing: 'ease-out' });
  }
}
