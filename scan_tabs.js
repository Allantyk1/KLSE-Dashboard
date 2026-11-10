/* scan_tabs.js  (2026-11-09) -- KLSE port of the US dashboard's scan tabs
   (US index.html / public.html, 2026-11-08). Shared by index.html and
   public.html so both pages list exactly the same stocks.

   Three shortlists layered on the same cards; search (and the KDJ chips on
   index.html) still apply on top:
    below_support - price at least GAP (slider, 10-40%) below the average
       "Entry - BB Zone" of the past week (5 sessions) or month (21 sessions):
       avgEntryW / avgEntryM, written by generate_dashboard_data.py from
       chart-history.json. Stocks at a new 52-week low are listed last.
    below_fair    - price under the blended fair value in the Valuation dialog
       (valuation_data.json; only the tickers that file covers). Fair value
       over FAIR_STRETCH x price is listed last ("check the methods").
    rebound       - stocks in a 15%+ dip (dip_watch_data.json) whose OWN past
       15%+ dips ran >= 30% off the low at least 70% of the time (min 5 dips).
       60-69% are listed last as close calls. Historical hit rate, not a forecast.

   Page API:
     ScanTabs.TABS                       -> [{key,label,scan:true}, ...] (append to CATEGORIES)
     ScanTabs.load()                     -> Promise; fetches dip_watch_data.json, never rejects
     ScanTabs.setStocks(allRows)         -> the dashboard's "all" list
     ScanTabs.isScan(key)
     ScanTabs.count(key)                 -> number shown on the tab
     ScanTabs.panelHTML(key, cardFn)     -> cardFn(stockRow, whyHtml) returns one card's HTML
     ScanTabs.bindControls(panel, onChange) -> wires the Below Support week/month + slider
*/
window.ScanTabs = (function () {
  const REBOUND_GAIN = 0.30, REBOUND_ODDS = 0.70, REBOUND_NEAR = 0.60, REBOUND_MIN_N = 5;
  const FAIR_STRETCH = 2.5;
  const TABS = [
    { key: 'below_support', label: 'Below Support', scan: true },
    { key: 'below_fair', label: 'Below Fair Value', scan: true },
    { key: 'rebound', label: 'Rebound ≥30%', scan: true },
  ];
  const KEYS = new Set(TABS.map(t => t.key));
  const STORE = 'klse-desk-support';

  let ALL = [], MAP = new Map(), DIP = null, dipTried = false;
  let BASIS = 'm';   // 'w' = past 5 sessions, 'm' = past 21 sessions
  let GAP = 0.10;    // minimum gap below that average (10-40%)
  try {
    const sv = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (sv && (sv.b === 'w' || sv.b === 'm')) BASIS = sv.b;
    if (sv && sv.g >= 10 && sv.g <= 40) GAP = sv.g / 100;
  } catch (e) {}

  /* ---- styles (injected so the two pages only need a <script> tag) ---- */
  const css = `
  .tab.scan-tab{ border-style:dashed; }
  .tab.scan-tab.active{ border-style:solid; background:var(--surface-raised); border-color:var(--gold); color:var(--gold); }
  .card.scan{ border-left-color:var(--gold); }
  .scan-note{ font-size:0.78rem; line-height:1.5; color:var(--text-muted); border-left:3px solid var(--gold);
    padding:0.55rem 0.8rem; margin:0 0 0.8rem; background:var(--surface); border-radius:6px; }
  .scan-note b{ color:var(--text); }
  .scan-why{ font-size:0.78rem; line-height:1.45; margin:0.5rem 0 0.1rem; padding:0.45rem 0.65rem; border-radius:8px;
    background:var(--buy-dim); color:var(--text); }
  .scan-why .warn{ display:inline-block; margin-left:0.4rem; color:var(--sell); font-weight:600; }
  .scan-why .muted{ color:var(--text-muted); }
  .scan-group{ font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-muted);
    margin:1.1rem 0.15rem 0.5rem; }
  .scan-ctrl{ display:flex; flex-wrap:wrap; align-items:center; gap:0.6rem 0.9rem; margin:0 0 0.7rem; padding:0.55rem 0.8rem;
    background:var(--surface); border:1px solid var(--border); border-radius:10px; font-size:0.78rem; color:var(--text-muted); }
  .scan-ctrl .seg{ display:inline-flex; border:1px solid var(--border); border-radius:8px; overflow:hidden; }
  .scan-ctrl .seg button{ background:none; border:0; padding:0.3rem 0.75rem; color:var(--text-muted); font:inherit; cursor:pointer; }
  .scan-ctrl .seg button.active{ background:var(--surface-raised); color:var(--gold); font-weight:600; }
  .scan-ctrl .gap-wrap{ display:flex; align-items:center; gap:0.5rem; flex:1 1 100%; min-width:0; white-space:nowrap; }
  .scan-ctrl input[type=range]{ flex:1; min-width:0; accent-color:var(--gold); }
  .scan-ctrl .gap-val{ font-family:'IBM Plex Mono', monospace; min-width:2.6em; color:var(--text); font-weight:600; }`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---- data ---- */
  function load() {
    return fetch('dip_watch_data.json?t=' + Date.now(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { DIP = d; })
      .catch(e => { DIP = null; console.warn('dip_watch_data.json not loaded:', e); })
      .finally(() => { dipTried = true; });
  }
  function setStocks(rows) {
    ALL = (rows || []).filter(s => s && s.ticker);
    MAP = new Map(ALL.map(s => [s.ticker, s]));
  }

  const rm = v => (v == null ? '—' : 'RM ' + Number(v).toFixed(3));
  const pct = v => (Math.abs(v) * 100).toFixed(1) + '%';
  const spct = v => (v >= 0 ? '+' : '−') + (Math.abs(v) * 100).toFixed(1) + '%';

  function atNew52wLow(t) {
    const f = DIP && DIP.flags ? DIP.flags[t] : null;
    return !!(f && f.low && f.low.slice(-1) === '1');
  }
  function reboundOdds(d) {
    const c = (d && d.card) || {};
    // r30 = full-history count written by generate_dip_watch.py (2026-11-09+);
    // an older file only carries the last 8 dips in card.eps, so fall back to those.
    if (c.r30 && c.r30.n) return { n: c.r30.n, hit: c.r30.hit, full: true };
    const eps = c.eps || [];
    return { n: eps.length, hit: eps.filter(e => e.run_gain != null && e.run_gain >= REBOUND_GAIN).length, full: false };
  }
  function valuation(t) {
    return window.Valuation && Valuation.get ? Valuation.get(t) : null;
  }

  function rows(key) {
    if (key === 'below_support') {
      const k = BASIS === 'w' ? 'avgEntryW' : 'avgEntryM';
      return ALL
        .filter(s => s.price != null && s[k] && s.price <= s[k] * (1 - GAP))
        .map(s => ({ s, avg: s[k], gap: s.price / s[k] - 1, near: atNew52wLow(s.ticker) }))
        .sort((a, b) => (a.near - b.near) || (a.gap - b.gap));
    }
    if (key === 'below_fair') {
      return ALL
        .map(s => ({ s, v: valuation(s.ticker) }))
        .filter(r => r.v && r.v.fair && r.s.price != null && r.s.price < r.v.fair)
        .map(r => ({ ...r, gap: r.s.price / r.v.fair - 1, near: r.v.fair > r.s.price * FAIR_STRETCH }))
        .sort((a, b) => (a.near - b.near) || (a.gap - b.gap));
    }
    if (key === 'rebound') {
      const out = [];
      ((DIP && DIP.dips) || []).forEach(d => {
        const s = MAP.get(d.t);
        if (!s) return;
        const o = reboundOdds(d);
        if (o.n < REBOUND_MIN_N) return;
        const odds = o.hit / o.n;
        if (odds < REBOUND_NEAR) return;
        out.push({ s, d, o, odds, near: odds < REBOUND_ODDS });
      });
      return out.sort((a, b) => (a.near - b.near) || (b.odds - a.odds) || (b.o.n - a.o.n));
    }
    return [];
  }

  function why(key, r) {
    const low52 = atNew52wLow(r.s.ticker) ? '<span class="warn">⚠ at a new 52-week low</span>' : '';
    if (key === 'below_support') {
      return `<div class="scan-why">Price is <b>${pct(r.gap)} below</b> the past ${BASIS === 'w' ? 'week' : 'month'}'s average Entry – BB Zone ${rm(r.avg)}${low52}</div>`;
    }
    if (key === 'below_fair') {
      const stretch = r.near
        ? `<span class="warn">⚠ fair value is over ${FAIR_STRETCH}× price – open Valuation and check which methods drive it</span>` : '';
      return `<div class="scan-why">Price is <b>${pct(r.gap)} below</b> the blended fair value ${rm(r.v.fair)} <span class="muted">(${r.v.n_methods} methods)</span>${stretch}</div>`;
    }
    if (key === 'rebound') {
      const now = r.d.card && r.d.card.now;
      const offLow = (now && now.low) ? ` · now ${spct(r.d.px / now.low - 1)} off this dip's low` : '';
      const sample = r.o.full ? '' : ' <span class="muted">(last 8 dips only)</span>';
      const chk = r.d.suspect ? '<span class="warn">⚠ CHECK DATA: a 45%+ one-day fall, often a bonus issue or split</span>' : '';
      return `<div class="scan-why"><b>${r.o.hit} of ${r.o.n}</b> past 15%+ dips ran ≥30% off the low (<b>${Math.round(r.odds * 100)}%</b>)${sample}`
        + ` · ${pct(r.d.dd)} below 20-day high${offLow}${r.d.low52 ? '<span class="warn">⚠ at a new 52-week low</span>' : ''}${chk}</div>`;
    }
    return '';
  }

  const NOTES = {
    below_support: () => `Stocks whose price has fallen <b>below the average "Entry – BB Zone" price of the past ${BASIS === 'w' ? 'week' : 'month'}</b> by at least the gap you set. The BB Zone entry follows the price down, so the average of where it sat recently is the line to test. Sorted deepest first. Stocks at a new 52-week low are listed separately at the bottom: in the US dip backtest (Oct 23) those had no bounce edge. Not yet backtested on Bursa.`,
    below_fair: () => `Stocks trading <b>below the blended fair value</b> from the Valuation dialog (median of up to 9 methods). Only tickers the valuation file covers can appear. A very large gap usually means one or two methods (often DCF on a cash-rich or cyclical year) are pulling the value up – open Valuation before trusting it.`,
    rebound: () => `Stocks now <b>15%+ below their 20-day high</b> whose own past 15%+ dips ran <b>≥30% off the low at least 70% of the time</b> (at least ${REBOUND_MIN_N} past dips, 5 years of Bursa prices). The 30% is measured from the dip low to the run's high before a 10% pullback, so it is the best-case exit, not a hold-to-date return. Each stock's own history, not a forecast: the US backtest found a strong past bounce record only slightly improved the next dip's outcome. Only stocks at RM0.20+ trading RM100k+ a day are checked. The Look-ahead scoreboard tracks how this list performs.`,
  };

  function count(key) { return rows(key).length; }
  function isScan(key) { return KEYS.has(key); }

  function controlsHTML() {
    const g = Math.round(GAP * 100);
    return `<div class="scan-ctrl">
      <span>Compare with the average of the past</span>
      <span class="seg" role="group" aria-label="Average over">
        <button type="button" data-basis="w" class="${BASIS === 'w' ? 'active' : ''}">Week</button><button type="button" data-basis="m" class="${BASIS === 'm' ? 'active' : ''}">Month</button>
      </span>
      <label class="gap-wrap">At least <input type="range" min="10" max="40" step="1" value="${g}" aria-label="Minimum gap below the average"><span class="gap-val">${g}%</span> below</label>
    </div>`;
  }

  function listHTML(key, cardFn) {
    const all = rows(key);
    const main = all.filter(r => !r.near), near = all.filter(r => r.near);
    if (key === 'rebound' && !DIP) {
      return `<div class="empty"><h2>No dip data</h2><p>dip_watch_data.json did not load${dipTried ? '' : ' yet'}. It is written by <code>generate_dip_watch.py</code> in run_daily.bat.</p></div>`;
    }
    if (!all.length) return `<div class="empty"><h2>Nothing here</h2><p>No stocks match this scan today.</p></div>`;
    let html = main.map(r => cardFn(r.s, why(key, r))).join('');
    if (near.length) {
      const title = key === 'below_fair' ? `Gap too large to trust – fair value over ${FAIR_STRETCH}× price`
        : key === 'below_support' ? 'At a new 52-week low – avoid for now'
        : `Close calls – ${Math.round(REBOUND_NEAR * 100)}-${Math.round(REBOUND_ODDS * 100) - 1}% hit rate`;
      html += `<div class="scan-group">${title} (${near.length})</div>` + near.map(r => cardFn(r.s, why(key, r))).join('');
    }
    return html;
  }

  function panelHTML(key, cardFn) {
    return (key === 'below_support' ? controlsHTML() : '')
      + `<div class="scan-note">${NOTES[key]()}</div>`
      + `<div class="scan-list">${listHTML(key, cardFn)}</div>`;
  }

  // Below Support: Week/Month + slider re-build only the list under the controls.
  function bindControls(panel, cardFn, onChange) {
    const ctrl = panel.querySelector('.scan-ctrl');
    if (!ctrl) return;
    const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ b: BASIS, g: Math.round(GAP * 100) })); } catch (e) {} };
    const redraw = () => {
      panel.querySelector('.scan-note').innerHTML = NOTES.below_support();
      panel.querySelector('.scan-list').innerHTML = listHTML('below_support', cardFn);
      save();
      if (onChange) onChange(panel);
    };
    ctrl.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
      BASIS = b.dataset.basis;
      ctrl.querySelectorAll('.seg button').forEach(x => x.classList.toggle('active', x === b));
      redraw();
    }));
    const range = ctrl.querySelector('input[type=range]'), val = ctrl.querySelector('.gap-val');
    range.addEventListener('input', () => {
      GAP = Number(range.value) / 100;
      val.textContent = range.value + '%';
      redraw();
    });
  }

  return { TABS, load, setStocks, isScan, count, panelHTML, bindControls };
})();
