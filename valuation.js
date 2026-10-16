/* KLSE Valuation dialog (added 2026-10-16, port of the US valuation.js)
   Shared by index.html, public.html and tracker.html. Reads
   valuation_data.json (built by generate_valuation.py) and opens a dialog
   from any element with data-val="TICKER" (e.g. 1155.KL). Colours come from
   the page's own tokens: tracker.html uses --panel/--ink/--green/--red/
   --amber, index/public use --surface/--text/--buy/--sell/--gold, so every
   colour below is var(--a, var(--b)) and follows the light/dark toggle.

   Public API:  Valuation.load() -> Promise<boolean>   (never rejects)
                Valuation.has(t) / Valuation.get(t)
                Valuation.button(t)   -> HTML for the "Valuation" button
                Valuation.bestTag(t)  -> HTML for the "3M BEST #n" tag
                Valuation.open(t) */
(function () {
  const FILE = 'valuation_data.json';
  let DATA = null, loading = null, dlg = null;

  const css = `
  .val-btn{font:600 10px 'IBM Plex Mono',monospace;letter-spacing:.03em;color:var(--ink-dim,var(--text-muted));background:var(--panel-2,var(--surface-raised));
    border:1px solid var(--line,var(--border));border-radius:5px;padding:2px 7px;margin-left:6px;cursor:pointer;vertical-align:1px;line-height:1.4}
  .val-btn:hover{color:var(--amber,var(--gold));border-color:var(--amber,var(--gold))}
  .val-btn:focus-visible{outline:2px solid var(--amber,var(--gold));outline-offset:1px}
  .best3m-tag{font:700 10px 'IBM Plex Mono',monospace;letter-spacing:.03em;color:var(--green,var(--buy));
    border:1px solid color-mix(in srgb,var(--green,var(--buy)) 45%,transparent);border-radius:5px;padding:1px 6px;margin-left:6px;white-space:nowrap}
  dialog.val-dlg{border:1px solid var(--line,var(--border));border-radius:16px;background:var(--panel,var(--surface));color:var(--ink,var(--text));padding:0;
    width:min(760px,calc(100vw - 20px));max-height:calc(100dvh - 24px);font-family:'Inter','IBM Plex Sans',system-ui,sans-serif;
    box-shadow:0 24px 60px rgba(0,0,0,.45)}
  dialog.val-dlg::backdrop{background:rgba(5,9,18,.62);backdrop-filter:blur(2px)}
  .val-in{padding:18px 18px 16px;overflow:auto;max-height:calc(100dvh - 26px)}
  .val-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
  .val-tk{font:700 20px 'IBM Plex Mono',monospace}
  .val-co{font-size:13px;color:var(--ink-dim,var(--text-muted));margin-top:2px}
  .val-x{background:var(--panel-2,var(--surface-raised));border:1px solid var(--line,var(--border));color:var(--ink-dim,var(--text-muted));width:34px;height:34px;border-radius:10px;
    font-size:18px;cursor:pointer;flex-shrink:0}
  .val-x:hover{color:var(--amber,var(--gold));border-color:var(--amber,var(--gold))}
  .val-chips{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 14px}
  .val-chip{font:600 10.5px 'IBM Plex Mono',monospace;color:var(--ink-dim,var(--text-muted));border:1px solid var(--line,var(--border));border-radius:999px;padding:2px 9px}
  .val-chip.amber{color:var(--amber,var(--gold));border-color:color-mix(in srgb,var(--amber,var(--gold)) 50%,transparent)}
  .val-chip.green{color:var(--green,var(--buy));border-color:color-mix(in srgb,var(--green,var(--buy)) 50%,transparent)}
  .val-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
  .val-box{background:var(--panel-2,var(--surface-raised));border-radius:10px;padding:9px 11px;min-width:0}
  .val-lbl{font:500 9.5px 'IBM Plex Mono',monospace;color:var(--ink-faint,var(--text-muted));text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
  .val-big{font:700 17px 'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
  .val-verdict{border-radius:10px;padding:9px 11px;font-weight:700;font-size:14px;display:flex;flex-direction:column;justify-content:center}
  .val-verdict.under{background:color-mix(in srgb,var(--green,var(--buy)) 16%,transparent);color:var(--green,var(--buy))}
  .val-verdict.over{background:color-mix(in srgb,var(--red,var(--sell)) 16%,transparent);color:var(--red,var(--sell))}
  .val-verdict small{font:500 10.5px 'Inter','IBM Plex Sans',sans-serif;opacity:.85;margin-top:2px}
  .val-q.Strong{color:var(--green,var(--buy))} .val-q.Moderate{color:var(--amber,var(--gold))} .val-q.Weak{color:var(--red,var(--sell))}
  .val-qchk{font-size:11px;color:var(--ink-dim,var(--text-muted));margin-top:4px;line-height:1.5}
  .val-h{font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--amber,var(--gold));margin:18px 0 8px}
  .val-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--ink-dim,var(--text-muted));margin:-2px 0 8px}
  .val-legend i{display:inline-block;width:14px;height:0;border-top:2px dashed currentColor;vertical-align:3px;margin-right:5px}
  .val-legend .sw{width:10px;height:10px;border:0;border-radius:2px;vertical-align:-1px}
  .val-rows{position:relative}
  .val-row{display:grid;grid-template-columns:minmax(118px,32%) 1fr;gap:10px;align-items:center;padding:5px 0;border-top:1px solid color-mix(in srgb,var(--line,var(--border)) 60%,transparent)}
  .val-row:first-child{border-top:0}
  .val-name{font-size:12.5px;line-height:1.25;min-width:0}
  .val-name small{display:block;color:var(--ink-faint,var(--text-muted));font-size:10.5px;margin-top:1px}
  .val-track{position:relative;height:22px}
  .val-bar{position:absolute;left:0;top:4px;height:14px;border-radius:0 3px 3px 0}
  .val-bar.up{background:var(--green,var(--buy))} .val-bar.dn{background:var(--red,var(--sell))} .val-bar.fair{background:var(--amber,var(--gold))}
  .val-bar.clip{border-radius:0}
  .val-num{position:absolute;top:2px;z-index:2;padding:0 3px;border-radius:3px;background:color-mix(in srgb,var(--panel,var(--surface)) 88%,transparent);font:600 11.5px 'IBM Plex Mono',monospace;white-space:nowrap;font-variant-numeric:tabular-nums}
  .val-num em{font-style:normal;font-weight:500;color:var(--ink-faint,var(--text-muted));margin-left:5px}
  .val-num.in{background:none;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.5)} .val-num.in em{color:rgba(255,255,255,.85)}
  .val-na{font-size:11px;color:var(--ink-faint,var(--text-muted));padding-top:3px}
  .val-line{position:absolute;top:0;bottom:0;border-left:2px dashed;pointer-events:none;z-index:1;opacity:.85}
  .val-line.px{border-color:var(--ink-dim,var(--text-muted))} .val-line.fv{border-color:var(--amber,var(--gold))}
  .val-rowfair .val-name{font-weight:700}
  .val-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .val-grid .val-big{font-size:14px}
  .val-foot{font-size:11px;color:var(--ink-faint,var(--text-muted));line-height:1.6;margin-top:16px}
  .val-foot b{color:var(--ink-dim,var(--text-muted));font-weight:600}
  .val-empty{padding:18px 0;color:var(--ink-dim,var(--text-muted));font-size:13px}
  .val-warn{font-size:12px;color:var(--amber,var(--gold));background:color-mix(in srgb,var(--amber,var(--gold)) 12%,transparent);border-radius:10px;padding:8px 10px;margin:0 0 10px;line-height:1.5}
  .val-hint{font-size:12px;color:var(--ink-dim,var(--text-muted));background:var(--panel-2,var(--surface-raised));border:1px dashed var(--line,var(--border));border-radius:10px;padding:8px 10px;margin:0 0 10px;line-height:2}
  @media (max-width:560px){
    .val-in{padding:14px 12px}
    .val-strip{grid-template-columns:1fr 1fr}
    .val-grid{grid-template-columns:1fr 1fr}
    .val-row{grid-template-columns:96px 1fr;gap:8px}
    .val-name small{display:none}
    .val-num .w{display:none}
    .val-name{font-size:11.5px}
  }`;

  const money = v => v == null ? '—' : (v < 0 ? '-RM ' : 'RM ') + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 3, maximumFractionDigits: 3});
  const code = t => String(t || '').replace(/\.KL$/i, '');   // 1155.KL -> 1155, as on the cards
  const pct = (v, d = 1) => v == null ? '—' : (v * 100).toFixed(d) + '%';
  const spct = (v, d = 1) => v == null ? '—' : (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + '%';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
  const compact = v => v == null ? '—' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : String(v);

  function injectCss() {
    if (document.getElementById('val-css')) return;
    const s = document.createElement('style'); s.id = 'val-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  function load() {
    if (loading) return loading;
    loading = fetch(FILE + '?v=' + Date.now(), {cache: 'no-store'})
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(d => { DATA = d; return true; })
      .catch(e => { console.warn('valuation_data.json not loaded:', e); return false; });
    return loading;
  }

  const get = t => DATA && DATA.tickers ? DATA.tickers[t] : null;
  const has = t => !!get(t);
  const button = t => has(t) ? `<button type="button" class="val-btn" data-val="${esc(t)}" title="Valuation: fair value by 9 methods" aria-label="Valuation for ${esc(code(t))}">Valuation</button>` : '';
  function bestTag(t) {
    const v = get(t); const b = v && v.best3m;
    return b ? `<span class="best3m-tag" title="Top ${DATA.lists.best3m.length} best performer over the past ${DATA.lists.best3m_months} months in the Pick Tracker (its Top 30 strong stocks): ${spct(b.pct)} since first Top-20 pick on ${esc(b.d)}">3M BEST #${b.rank}</span>` : '';
  }

  // Search-box shortcut for tickers that have a valuation but no card on the
  // page (e.g. extras from valuation_extra.txt outside the screener). Matches
  // the code (1155, 1155.KL) or the start of the name.
  function searchHint(q, shownTickers) {
    q = String(q || '').trim().toUpperCase().replace(/\.KL$/, '');
    if (!q || !DATA || !DATA.tickers) return '';
    const shown = new Set(shownTickers || []);
    const hits = Object.keys(DATA.tickers).filter(t => {
      if (shown.has(t)) return false;
      const v = DATA.tickers[t], c = code(t), nm = String(v.short || v.co || '').toUpperCase();
      return c === q || (q.length >= 2 && (c.startsWith(q) || nm.startsWith(q)));
    }).slice(0, 6);
    if (!hits.length) return '';
    return `<div class="val-hint">Not in the screener list · valuation available: ${hits.map(t => `<button type="button" class="val-btn" data-val="${esc(t)}">${esc(code(t))}${DATA.tickers[t].short ? ' ' + esc(DATA.tickers[t].short) : ''}</button>`).join('')}</div>`;
  }

  function ensureDialog() {
    if (dlg) return dlg;
    injectCss();
    dlg = document.createElement('dialog');
    dlg.className = 'val-dlg';
    dlg.setAttribute('aria-label', 'Valuation');
    dlg.innerHTML = '<div class="val-in" id="valBody"></div>';
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });  // tap backdrop to close
    document.body.appendChild(dlg);
    return dlg;
  }

  function chips(v) {
    const out = [];
    if (v.lists.includes('top20')) out.push('<span class="val-chip amber">TOP 20 today</span>');
    if (v.lists.includes('extra')) out.push('<span class="val-chip">Added by you</span>');
    if (v.best3m) out.push(`<span class="val-chip green">3M best #${v.best3m.rank} · ${spct(v.best3m.pct)} since ${esc(v.best3m.d)}</span>`);
    return out.join('');
  }

  function bars(v) {
    const px = v.price, fair = v.fair;
    const vals = v.methods.map(m => m.value).filter(x => x != null);
    // Scale to the larger of 2.2x price or the 2nd-largest value, so one
    // extreme method can't squash every other bar; longer bars are clipped.
    const sorted = [...vals, px || 0, fair || 0].sort((a, b) => b - a);
    const max = Math.max(px * 2.2 || 0, sorted[1] || sorted[0] || 1) * 1.04;
    const x = val => Math.min(100, 100 * val / max);
    const narrow = matchMedia('(max-width:560px)').matches;
    const row = (name, sub, val, prem, cls, extra = '') => {
      if (val == null) return `<div class="val-row${extra}"><div class="val-name">${name}<small>${esc(sub)}</small></div><div class="val-na">n/a · ${esc(sub)}</div></div>`;
      const w = x(val), clip = val > max;
      const lbl = `${money(val)}${prem != null ? `<em>${spct(prem)}<span class="w"> ${prem <= 0 ? 'disc' : 'prem'}</span></em>` : ''}`;
      // label sits right of the bar, or inside the bar's right end when the bar is long
      const inside = w > (narrow ? 48 : 60);
      const pos = inside ? `right:${100 - w + 1}%` : `left:calc(${w}% + 5px)`;
      return `<div class="val-row${extra}"><div class="val-name">${name}<small>${esc(sub)}</small></div>
        <div class="val-track"><div class="val-bar ${cls}${clip ? ' clip' : ''}" style="width:${w}%"></div><div class="val-num${inside ? ' in' : ''}" style="${pos}">${clip ? '› ' : ''}${lbl}</div></div></div>`;
    };
    let h = v.methods.map(m => row(esc(m.label), m.note, m.value, m.prem, m.value != null && m.value >= px ? 'up' : 'dn')).join('');
    h += row('Blended fair value', `median of ${v.n_methods} methods`, fair, fair ? (px - fair) / fair : null, 'fair', ' val-rowfair');
    // dashed reference lines over the bar column: price + fair value
    const lines = `<div class="val-line px" style="left:${x(px)}%" title="Price ${money(px)}"></div>` +
      (fair ? `<div class="val-line fv" style="left:${x(fair)}%" title="Fair value ${money(fair)}"></div>` : '');
    return `<div class="val-legend"><span><i class="sw" style="background:var(--green,var(--buy))"></i>above price (undervalued)</span>
      <span><i class="sw" style="background:var(--red,var(--sell))"></i>below price (overvalued)</span>
      <span style="color:var(--ink-dim,var(--text-muted))"><i></i>price ${money(px)}</span><span style="color:var(--amber,var(--gold))"><i></i>fair value ${money(fair)}</span></div>
      <div class="val-rows" id="valRows">${h}<div id="valLines" style="position:absolute;top:0;bottom:0;pointer-events:none">${lines}</div></div>`;
  }

  function placeLines() {
    // align the overlay with the bar column (its left edge differs between phone and desktop)
    const rows = document.getElementById('valRows'), ov = document.getElementById('valLines');
    const tr = rows && rows.querySelector('.val-track');
    if (!tr) return;
    const a = rows.getBoundingClientRect(), b = tr.getBoundingClientRect();
    ov.style.left = (b.left - a.left) + 'px'; ov.style.width = b.width + 'px';
  }

  function body(t, v) {
    if (!v) return `<div class="val-empty">No valuation for ${esc(code(t))} yet. Add it to valuation_extra.txt and it appears after the next daily run.</div>`;
    const sub = [v.short, v.co].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ');
    const head = `<div class="val-hd"><div><div class="val-tk">${esc(code(t))}</div><div class="val-co">${esc(sub)}</div></div>
      <button type="button" class="val-x" aria-label="Close" onclick="this.closest('dialog').close()">×</button></div>
      <div class="val-chips">${chips(v)}</div>`;
    if (v.etf) return head + `<div class="val-empty">${esc(code(t))} is an ETF. These methods value one company's earnings and cash flow, so they don't apply to a fund.</div>`;
    if (v.error) return head + `<div class="val-empty">${esc(v.error)}. It should appear after the next pipeline run.</div>`;

    const under = v.mos != null && v.mos >= 0;
    const verdict = v.mos == null ? '<div class="val-box"><div class="val-lbl">Verdict</div><div class="val-big">—</div></div>' :
      `<div class="val-verdict ${under ? 'under' : 'over'}">${pct(Math.abs(v.mos))} ${under ? 'Undervalued' : 'Overvalued'}<small>price vs blended fair value</small></div>`;
    const q = v.quality;
    const strip = `<div class="val-strip">
      <div class="val-box"><div class="val-lbl">Price</div><div class="val-big">${money(v.price)}</div></div>
      <div class="val-box"><div class="val-lbl">Fair value</div><div class="val-big" style="color:var(--amber,var(--gold))">${money(v.fair)}</div></div>
      ${verdict}
      <div class="val-box" title="${esc(q.checks.map(c => (c.ok ? '✓ ' : '✗ ') + c.label).join('\n'))}"><div class="val-lbl">Quality</div>
        <div class="val-big val-q ${q.grade}">${q.grade} <span style="font-size:12px;color:var(--ink-faint,var(--text-muted))">${q.score}/5</span></div></div>
    </div>
    <div class="val-qchk">${q.checks.map(c => `<span style="color:${c.ok ? 'var(--green,var(--buy))' : 'var(--ink-faint,var(--text-muted))'}">${c.ok ? '✓' : '✗'} ${esc(c.label)}</span>`).join(' · ')}</div>`;

    const m = v.metrics;
    const cell = (k, val) => `<div class="val-box"><div class="val-lbl">${k}</div><div class="val-big">${val}</div></div>`;
    const grid = `<div class="val-grid">
      ${cell('P/E (TTM)', m.pe ?? '—')}${cell('Forward P/E', m.fwd_pe ?? '—')}${cell('PEG (TTM)', m.peg ?? '—')}
      ${cell('Return on equity', pct(m.roe))}${cell('Return on invested capital', pct(m.roic))}${cell('FCF yield', pct(m.fcf_yield, 2))}
      ${cell('EPS growth, next yr', pct(m.eps_growth_1y))}${cell('EPS growth, 5-yr est.', pct(m.eps_growth_5y))}${cell('Dividend yield', pct(m.div_yield, 2))}
      ${cell('Gross margin', pct(m.gross_margin))}${cell('Diluted shares', compact(m.shares))}${cell('Methods used', `${v.n_methods} of 9`)}
    </div>`;

    const a = v.assume, A = DATA.assumptions;
    const g1note = a.g1_raw != null && a.g1 !== a.g1_raw ? ` (${esc(a.g1_src)} ${pct(a.g1_raw)}, ${a.g1_raw > a.g1 ? 'capped' : 'floored'})` : a.g1_src ? ` (${esc(a.g1_src)})` : '';
    const foot = `<div class="val-foot">
      <b>Assumptions.</b> Cash-flow methods project 20 years: years 1–5 grow ${pct(a.g1)}${g1note}, years 6–10 ${pct(a.g2)}, years 11–20 ${pct(a.g3)};
      discounted at ${pct(a.disc)} (Malaysian 10-yr MGS ${pct(A.risk_free, 2)} + beta ${a.beta ?? 'n/a'} × ${pct(A.equity_premium, 0)} equity premium, kept between ${pct(A.discount_min, 0)} and ${pct(A.discount_max, 0)}), plus net cash of ${money(a.net_cash_ps)} a share.
      DFCF-Terminal uses 10 years plus a ${pct(A.terminal_growth, 0)} perpetual growth value. Mean P/S, P/E, P/B use the average multiple over the fiscal years Yahoo provides (about 4).
      PEG uses a fair P/E equal to the growth rate; PSG uses a fair P/S of ${A.psg_fair} × revenue growth %.
      The blended fair value is the median of the methods that apply, and % undervalued is (fair − price) ÷ fair.
      For banks and REITs the cash-flow methods fit poorly (deposits, loans and property revaluations distort cash flow), so lean on P/B and P/E.
      Yahoo often has no analyst growth estimates for Bursa stocks; the growth rate then comes from revenue history.<br>
      Fundamentals fetched ${esc(v.fetched)} (refreshed every ${A.refresh_days} days) · price from the ${esc((DATA.price_date || '').slice(0, 10))} close.
      These are estimates from Yahoo data, not StockOracle's figures, and not financial advice.</div>`;

    const warn = v.warn ? `<div class="val-warn">⚠ ${esc(v.warn)}</div>` : '';
    return head + warn + strip + `<div class="val-h">Valuation by method</div>` + bars(v) +
      `<div class="val-h">Key metrics</div>` + grid + foot;
  }

  async function open(t) {
    ensureDialog();
    await load();
    document.getElementById('valBody').innerHTML = body(t, get(t));
    if (!dlg.open) dlg.showModal();
    document.getElementById('valBody').scrollTop = 0;
    requestAnimationFrame(placeLines);
  }

  // One capture-phase listener for every page: opening the dialog must not
  // also toggle the card underneath (index.html cards expand on click).
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-val]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    open(b.dataset.val);
  }, true);
  addEventListener('resize', () => { if (dlg && dlg.open) placeLines(); });

  injectCss();
  window.Valuation = {load, has, get, button, bestTag, open, searchHint};
})();
