// The two screen types every section uses:
//   FlowView  – Itemzflow coverflow + game page (Games, Applications, Homebrew)
//   PanelView – list on the left, detail on the right (everything else)
import { Coverflow } from './carousel.js';
import { coverArt } from './art.js';
import { storage, formatPlayed } from './data.js';
import { toggleFavorite } from './settings.js';
import { esc, icon, btn, tag, blip, toast, simulated, confirmDialog, showSplash } from './ui.js';

// Game-page options, as in Itemzflow's ITEM_PAGE (trimmed to what makes sense in Stage 1).
const OPTIONS = {
  launch: { label: () => 'Launch', desc: 'Launches the selected title.', sim: true, run: launch },
  trainers: { label: () => 'Trainers & Cheats', desc: 'Cheats and patches through GoldHEN. Visual only in Stage 1.', sim: true, run: (it) => simulated(`Loading cheats for ${it.title}`) },
  favorite: { label: (it) => (it.fav ? 'Remove from Favorites' : 'Add to Favorites'), desc: 'Marks this title with a heart. Saved in this browser.', run: favorite },
  hide: { label: () => 'Hide App', desc: 'Hides the title from the console app database.', sim: true, run: (it) => simulated(`Hiding ${it.title}`) },
  uninstall: { label: () => 'Uninstall', desc: 'Removes the title and its add-ons.', sim: true, run: uninstall },
};
const PAGE_OPTIONS = { game: ['launch', 'trainers', 'favorite', 'hide', 'uninstall'], app: ['launch', 'favorite'], homebrew: ['launch', 'favorite', 'uninstall'] };

async function launch(it) {
  const art = it.kind === 'game' ? coverArt(it) : '';
  await showSplash(`<div class="launch">${art ? `<img src="${art}" alt="">` : icon(it.icon || 'apps', 'launch-ico')}
    <h2>Launching ${esc(it.title)}…</h2><div class="spinner"></div><p>${tag('sim')} No console is connected. Nothing is executed.</p></div>`, { ms: 2200 });
  toast('Simulated launch', `${it.title} would start here once console integration exists.`, 'sim');
}

function favorite(it, view) {
  it.fav = toggleFavorite(it.id);
  toast(it.fav ? 'Added to Favorites' : 'Removed from Favorites', it.title, 'success');
  view.cf.refresh();
}

async function uninstall(it) {
  if (await confirmDialog({ title: 'Uninstall', message: `Uninstall ${it.title}? This only shows what would happen — nothing is removed.`, confirm: 'Uninstall' })) {
    simulated(`Uninstalling ${it.title}`);
  }
}

const row = (it, i, sel) => {
  if (it.group) return `<div class="row group">${esc(it.group)}</div>`;
  return `<div class="row${sel ? ' sel' : ''}${it.sub ? ' has-sub' : ''}${it.unread ? ' unread' : ''}" data-idx="${i}">
    ${it.icon ? icon(it.icon) : ''}${it.lead || ''}
    <div class="txt"><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
    ${it.valueHTML ?? (it.value != null ? `<span class="val">${esc(it.value)}</span>` : '')}</div>`;
};

export class FlowView {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.lastId = {};
    root.innerHTML = '<div class="flow-caption"></div><div class="cf-stage"></div><div class="flow-info"></div><div class="storage"></div><div class="page-panel"></div>';
    this.cf = new Coverflow(root.querySelector('.cf-stage'), {
      config: app.flowConfig,
      onChange: () => this.renderInfo(),
      onSelect: () => this.openPage(),
    });
    root.querySelector('.flow-info').addEventListener('click', (e) => { if (e.target.closest('.select')) this.openPage(); });
    root.querySelector('.page-panel').addEventListener('click', (e) => {
      const r = e.target.closest('[data-opt]');
      if (!r) return;
      if (Number(r.dataset.opt) === this.page.sel) this.handle('cross');
      else { this.page.sel = Number(r.dataset.opt); this.renderPage(); }
    });
    root.querySelector('.storage').innerHTML = storage.map((s) => `<div><b>${esc(s.name)}</b> <span class="mock">MOCK</span>
      <div class="bar"><i style="width:${(s.used / s.total) * 100}%"></i></div>${(s.total - s.used).toFixed(1)} GB free of ${s.total} GB</div>`).join('');
  }

  show(section) {
    if (this.page) this.closePage(true);
    this.section = section;
    const items = section.items();
    this.root.querySelector('.flow-caption').innerHTML = `<b>${esc(section.label)}</b> · ${items.length} ${esc(section.noun)} · mock data`;
    this.cf.setItems(items, section.shape, this.lastId[section.id]);
  }

  renderInfo() {
    const it = this.cf.current;
    const info = this.root.querySelector('.flow-info');
    if (!it) { info.innerHTML = '<h2>Nothing installed</h2>'; return; }
    this.lastId[this.section.id] = it.id;
    info.innerHTML = `<h2>${it.fav ? '<span class="heart">♥</span> ' : ''}${esc(it.title)}</h2>
      <div class="meta"><span class="tid">${esc(it.id)} · </span>${esc(it.type)} (${esc(it.version)})</div>
      <div class="desc">${esc(it.desc)}</div>
      <button class="select">${btn('cross')}<span>Select</span></button>`;
    this.app.updatePrompts();
  }

  openPage() {
    if (!this.cf.current) return;
    blip('select');
    this.page = { sel: 0 };
    this.cf.setPage(true);
    this.root.classList.add('paged');
    this.renderPage();
  }

  closePage(silent) {
    this.page = null;
    this.cf.setPage(false);
    this.root.classList.remove('paged');
    if (!silent) { blip('back'); this.app.updatePrompts(); }
  }

  renderPage() {
    const it = this.cf.current;
    const opts = PAGE_OPTIONS[it.kind];
    const o = OPTIONS[opts[this.page.sel]];
    const facts = it.kind === 'game'
      ? [['Title ID', it.id], ['Version', it.version], ['Type', it.type], ['Size', it.size], ['Genre', it.genre], ['Publisher', it.publisher], ['Released', it.released], ['Time played', formatPlayed(it.played)], ['Last played', it.lastPlayed], ['Trophies', `${it.trophies[0]} / ${it.trophies[1]}`]]
      : [['Title ID', it.id], ['Version', it.version], ['Type', it.type], ['Size', it.size]];
    this.root.querySelector('.page-panel').innerHTML = `
      <h1>${esc(it.title)}</h1><div class="page-sub">${esc(it.id)} ${esc(it.type)} (${esc(it.version)})</div>
      <div class="opts">${opts.map((k, i) => `<div class="row${i === this.page.sel ? ' sel' : ''}${k === 'launch' ? ' launch-row' : ''}" data-opt="${i}">
        ${k === 'launch' ? btn('cross') : ''}<div class="txt"><b>${esc(OPTIONS[k].label(it))}</b></div>${OPTIONS[k].sim ? '<span class="mini-sim">SIM</span>' : ''}</div>`).join('')}</div>
      <p class="page-desc">${esc(o.desc)}</p>
      <dl class="info-grid">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    this.app.updatePrompts();
  }

  handle(action) {
    if (this.page) {
      const opts = PAGE_OPTIONS[this.cf.current.kind];
      if (action === 'up' || action === 'down') {
        const sel = this.page.sel + (action === 'up' ? -1 : 1);
        if (sel >= 0 && sel < opts.length) { this.page.sel = sel; blip(); this.renderPage(); }
        return true;
      }
      if (action === 'cross') {
        blip('select');
        const it = this.cf.current;
        Promise.resolve(OPTIONS[opts[this.page.sel]].run(it, this)).then(() => { if (this.page) this.renderPage(); this.renderInfo(); });
        return true;
      }
      if (action === 'circle') { this.closePage(); return true; }
      return true; // page swallows everything else
    }
    switch (action) {
      case 'left':
      case 'right':
        if (this.cf.move(action === 'left' ? -1 : 1)) blip();
        return true;
      case 'cross': this.openPage(); return true;
      case 'square': if (this.cf.current) favorite(this.cf.current, this); this.renderInfo(); return true;
      case 'triangle': toast('Simulated', `Rescanned ${this.section.label.toLowerCase()} — mock list unchanged.`, 'sim'); return true;
      case 'down': return true;
      default: return false; // up / circle → navigation bar
    }
  }

  prompts() {
    if (this.page) return [['cross', 'Select'], ['circle', 'Back'], ['updown', 'Options']];
    return [['cross', 'Select'], ['square', 'Favorite'], ['triangle', 'Reload'], ['options', 'Settings'], ['circle', 'Menu']];
  }
}

export class PanelView {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.sel = {};
    root.addEventListener('click', (e) => {
      const r = e.target.closest('[data-idx]');
      if (!r) return;
      if (Number(r.dataset.idx) === this.index) this.handle('cross');
      else { this.index = Number(r.dataset.idx); this.render(); }
    });
  }

  get index() { return this.sel[this.section.id] ?? -1; }
  set index(i) { this.sel[this.section.id] = i; }
  get current() { return this.items[this.index]; }

  show(section) {
    this.section = section;
    this.render();
  }

  render() {
    const s = this.section;
    const items = (this.items = s.items(this));
    if (!items[this.index] || items[this.index].group) this.index = items.findIndex((x) => !x.group);
    const cur = items[this.index];
    this.root.innerHTML = `<div class="panel-head">${icon(s.icon)}<h1>${esc(s.label)}</h1>${tag(s.kind)}${s.crumb ? `<span class="crumb">${esc(s.crumb())}</span>` : ''}</div>
      <div class="panel-list">${items.map((it, i) => row(it, i, i === this.index)).join('')}</div>
      <div class="panel-detail">${cur ? s.detail(cur, this) : '<p>Empty.</p>'}</div>`;
    this.root.querySelector('.row.sel')?.scrollIntoView({ block: 'nearest' });
    this.app.updatePrompts();
  }

  selectWhere(fn) {
    const i = this.items.findIndex(fn);
    if (i >= 0) this.index = i;
  }

  handle(action) {
    const s = this.section;
    const it = this.current;
    if (action === 'up' || action === 'down') {
      let i = this.index;
      do i += action === 'up' ? -1 : 1; while (this.items[i]?.group);
      if (!this.items[i]) return action === 'down'; // "up" at the top falls through to the nav bar
      this.index = i;
      blip();
      this.render();
      return true;
    }
    if ((action === 'left' || action === 'right') && it && s.adjust?.(it, action === 'left' ? -1 : 1, this)) {
      blip();
      this.render();
      return true;
    }
    if (action === 'cross' && it && s.activate) {
      blip('select');
      Promise.resolve(s.activate(it, this)).then(() => this.render());
      return true;
    }
    if (action === 'circle' && s.back?.(this)) {
      blip('back');
      this.render();
      return true;
    }
    return false;
  }

  prompts() {
    return this.section.prompts?.(this.current) ?? [['cross', 'Select'], ['circle', 'Back'], ['updown', 'Navigate'], ['l1r1', 'Sections']];
  }
}
