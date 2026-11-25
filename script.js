// Beyond the Sticker Price: browser-only vehicle cost comparison.
// Everything runs client-side. State lives in memory and in the URL hash (for share links).
'use strict';

/* ---------- Field definitions ---------- */

const PURCHASE = [
  ['price', 'Vehicle price ($)'],
  ['downPayment', 'Down payment ($)'],
  ['tradeIn', 'Trade-in value ($)'],
  ['interestRate', 'Annual interest rate (%)'],
  ['loanTerm', 'Loan term (months)'],
  ['taxRate', 'Sales tax rate (%)']
];
const OWNERSHIP = [
  ['insurance', 'Insurance ($/month)'],
  ['fuel', 'Fuel / charging ($/month)'],
  ['maintenance', 'Maintenance ($/month)'],
  ['repairs', 'Repairs reserve ($/month)'],
  ['tires', 'Tires reserve ($/month)'],
  ['parking', 'Parking ($/month)'],
  ['tickets', 'Tickets / fines ($/month)'],
  ['other', 'Other costs ($/month)']
];
const FIELDS = [...PURCHASE, ...OWNERSHIP];
const FIELD_IDS = FIELDS.map(([id]) => id);
const MAX_VEHICLES = 3;

// Each vehicle keeps its color slot for life: color follows the vehicle, not its position.
const VEHICLE_COLORS = ['#257de0', '#f47230', '#00b894'];
const VEHICLE_LETTERS = ['A', 'B', 'C'];

// Cost categories for the stacked bars (palette validated for color-vision deficiency).
const CATEGORIES = [
  { label: 'Loan payment', color: '#f2a600', get: (v, r) => r.payment },
  { label: 'Insurance', color: '#ee7fac', get: v => v.insurance },
  { label: 'Fuel / charging', color: '#008a17', get: v => v.fuel },
  { label: 'Maintenance, repairs & tires', color: '#6a4ce2', get: v => v.maintenance + v.repairs + v.tires },
  { label: 'Parking, fines & other', color: '#ec4647', get: v => v.parking + v.tickets + v.other }
];

// Illustrative example vehicles (round, plausible numbers, not quotes).
const PRESETS = {
  'New car example': { price: 30000, downPayment: 5000, tradeIn: 0, interestRate: 7, loanTerm: 60, taxRate: 5, insurance: 250, fuel: 180, maintenance: 75, repairs: 50, tires: 30, parking: 0, tickets: 0, other: 0 },
  'Used car example': { price: 18000, downPayment: 2000, tradeIn: 0, interestRate: 8.5, loanTerm: 48, taxRate: 5, insurance: 210, fuel: 170, maintenance: 90, repairs: 90, tires: 30, parking: 0, tickets: 0, other: 0 },
  'Compact sedan (new)': { price: 26000, downPayment: 3000, tradeIn: 0, interestRate: 6.5, loanTerm: 60, taxRate: 5, insurance: 220, fuel: 150, maintenance: 60, repairs: 30, tires: 25, parking: 0, tickets: 0, other: 0 },
  'Midsize SUV (new)': { price: 42000, downPayment: 5000, tradeIn: 0, interestRate: 6.9, loanTerm: 72, taxRate: 5, insurance: 280, fuel: 240, maintenance: 85, repairs: 40, tires: 40, parking: 0, tickets: 0, other: 0 },
  'Pickup truck (new)': { price: 55000, downPayment: 6000, tradeIn: 0, interestRate: 7.4, loanTerm: 84, taxRate: 5, insurance: 310, fuel: 330, maintenance: 100, repairs: 50, tires: 50, parking: 0, tickets: 0, other: 0 },
  'Electric vehicle (new)': { price: 48000, downPayment: 5000, tradeIn: 0, interestRate: 5.9, loanTerm: 72, taxRate: 5, insurance: 290, fuel: 70, maintenance: 40, repairs: 30, tires: 45, parking: 0, tickets: 0, other: 0 },
  'Used commuter car': { price: 12000, downPayment: 2000, tradeIn: 0, interestRate: 9.5, loanTerm: 36, taxRate: 5, insurance: 200, fuel: 160, maintenance: 90, repairs: 100, tires: 30, parking: 0, tickets: 0, other: 0 }
};

/* ---------- Formatting helpers ---------- */

const money = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
const money0 = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n);
const moneyCompact = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = id => document.getElementById(id);
const years = n => `${n} year${n === 1 ? '' : 's'}`;

/* ---------- State ---------- */

function makeVehicle(slot, name, values) {
  const v = {};
  FIELD_IDS.forEach(id => { v[id] = String(values[id] ?? 0); });
  return { slot, name, values: v };
}

function defaultState() {
  return {
    active: 0,
    horizon: 5,
    vehicles: [
      makeVehicle(0, 'New car example', PRESETS['New car example']),
      makeVehicle(1, 'Used car example', PRESETS['Used car example'])
    ]
  };
}

let state = loadFromHash() || defaultState();

function activeVehicle() { return state.vehicles[state.active]; }
function vehicleName(veh) { return veh.name.trim() || `Vehicle ${VEHICLE_LETTERS[veh.slot]}`; }

/* ---------- Calculation ---------- */

// Returns { ok, values (numbers), invalid: Set of field ids }.
function parseVehicle(veh) {
  const values = {};
  const invalid = new Set();
  FIELD_IDS.forEach(id => {
    const raw = String(veh.values[id]).trim();
    const n = Number(raw);
    const bad = raw === '' || !Number.isFinite(n) || n < 0 ||
      (id === 'loanTerm' && (!Number.isInteger(n) || n < 1 || n > 600)) ||
      (id === 'interestRate' && n > 100) || (id === 'taxRate' && n > 100);
    if (bad) invalid.add(id);
    values[id] = n;
  });
  return { ok: invalid.size === 0, values, invalid };
}

// Amount financed = max(0, price + sales tax - down payment - trade-in); fixed-rate monthly amortization.
function estimate(v) {
  const financed = Math.max(0, v.price * (1 + v.taxRate / 100) - v.downPayment - v.tradeIn);
  const rate = v.interestRate / 1200;
  const payment = financed === 0 ? 0
    : rate === 0 ? financed / v.loanTerm
    : financed * rate / (-Math.expm1(-v.loanTerm * Math.log1p(rate)));
  const running = OWNERSHIP.reduce((sum, [id]) => sum + v[id], 0);
  const interest = payment * v.loanTerm - financed;
  return { financed, payment, running, interest, total: payment + running };
}

// Cash spent by the end of month m: down payment + loan payments made so far + running costs.
function cumulative(v, r, m) {
  return v.downPayment + r.payment * Math.min(m, v.loanTerm) + r.running * m;
}

function results() {
  return state.vehicles.map((veh, index) => {
    const parsed = parseVehicle(veh);
    const r = parsed.ok ? estimate(parsed.values) : null;
    const ok = !!r && Object.values(r).every(Number.isFinite);
    return { veh, index, name: vehicleName(veh), color: VEHICLE_COLORS[veh.slot], v: parsed.values, invalid: parsed.invalid, r: ok ? r : null };
  });
}

/* ---------- Tabs ---------- */

function renderTabs() {
  $('tabs').innerHTML = state.vehicles.map((veh, i) => `
    <button type="button" role="tab" id="tab-${i}" class="tab" aria-selected="${i === state.active}" aria-controls="calculator" tabindex="${i === state.active ? 0 : -1}" data-index="${i}">
      <span class="swatch" style="background:${VEHICLE_COLORS[veh.slot]}"></span>
      <span class="tab-name">${esc(vehicleName(veh))}</span>
    </button>`).join('');
  $('calculator').setAttribute('aria-labelledby', `tab-${state.active}`);
  const full = state.vehicles.length >= MAX_VEHICLES;
  $('add-vehicle').disabled = full;
  $('add-vehicle').textContent = full ? 'Up to 3 vehicles' : '+ Add vehicle';
  $('remove-vehicle').hidden = state.vehicles.length <= 1;
}

$('tabs').addEventListener('click', e => {
  const tab = e.target.closest('[role="tab"]');
  if (tab) selectVehicle(Number(tab.dataset.index));
});
$('tabs').addEventListener('keydown', e => {
  const n = state.vehicles.length;
  let next = null;
  if (e.key === 'ArrowRight') next = (state.active + 1) % n;
  if (e.key === 'ArrowLeft') next = (state.active - 1 + n) % n;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = n - 1;
  if (next !== null) {
    e.preventDefault();
    selectVehicle(next);
    $(`tab-${next}`).focus();
  }
});

function selectVehicle(i) {
  state.active = i;
  renderTabs();
  renderForm();
  update();
}

$('add-vehicle').addEventListener('click', () => {
  if (state.vehicles.length >= MAX_VEHICLES) return;
  const used = new Set(state.vehicles.map(v => v.slot));
  const slot = [0, 1, 2].find(s => !used.has(s));
  const copy = { ...activeVehicle().values };
  state.vehicles.push(makeVehicle(slot, `Vehicle ${VEHICLE_LETTERS[slot]}`, copy));
  selectVehicle(state.vehicles.length - 1);
  $('vehicle-name').focus();
  $('vehicle-name').select();
});

$('remove-vehicle').addEventListener('click', () => {
  if (state.vehicles.length <= 1) return;
  state.vehicles.splice(state.active, 1);
  state.active = Math.max(0, state.active - 1);
  selectVehicle(state.active);
  $(`tab-${state.active}`).focus();
});

/* ---------- Form ---------- */

function fieldHTML([id, label]) {
  const isTerm = id === 'loanTerm';
  return `<div class="field">
    <label for="${id}">${label}</label>
    <input id="${id}" name="${id}" type="number" inputmode="decimal" min="${isTerm ? 1 : 0}" step="${isTerm ? 1 : '0.01'}" aria-describedby="${id}-error">
    <span class="field-error" id="${id}-error"></span>
  </div>`;
}
$('purchase-fields').innerHTML = PURCHASE.map(fieldHTML).join('');
$('ownership-fields').innerHTML = OWNERSHIP.map(fieldHTML).join('');
$('preset').insertAdjacentHTML('beforeend', Object.keys(PRESETS).map(name => `<option>${esc(name)}</option>`).join(''));

function renderForm() {
  const veh = activeVehicle();
  $('vehicle-name').value = veh.name;
  FIELD_IDS.forEach(id => { $(id).value = veh.values[id]; });
  $('preset').value = '';
}

$('calculator').addEventListener('submit', e => e.preventDefault());
$('calculator').addEventListener('input', e => {
  const id = e.target.id;
  const veh = activeVehicle();
  if (id === 'vehicle-name') {
    veh.name = e.target.value;
    const tabName = document.querySelector(`#tab-${state.active} .tab-name`);
    if (tabName) tabName.textContent = vehicleName(veh);
  } else if (FIELD_IDS.includes(id)) {
    veh.values[id] = e.target.value;
  } else {
    return; // fuel helper inputs handle themselves
  }
  update();
});

$('preset').addEventListener('change', e => {
  const name = e.target.value;
  if (!PRESETS[name]) return;
  const veh = activeVehicle();
  FIELD_IDS.forEach(id => { veh.values[id] = String(PRESETS[name][id]); });
  veh.name = name;
  renderTabs();
  renderForm();
  update();
});

function fieldMessage(id) {
  if (id === 'loanTerm') return 'Enter a whole number of months from 1 to 600.';
  if (id === 'interestRate' || id === 'taxRate') return 'Enter a percentage from 0 to 100.';
  return 'Enter an amount of 0 or more.';
}

/* ---------- Fuel helper ---------- */

function fuelEstimate() {
  const km = Number($('km').value), use = Number($('consumption').value), price = Number($('fuel-price').value);
  if (![km, use, price].every(n => Number.isFinite(n) && n >= 0)) return null;
  return km / 100 * use * price;
}
function updateFuelHelper() {
  const f = fuelEstimate();
  $('fuel-estimate').textContent = f === null ? 'Enter values of 0 or more' : `≈ ${money(f)} / month`;
  $('apply-fuel').disabled = f === null;
}
['km', 'consumption', 'fuel-price'].forEach(id => $(id).addEventListener('input', updateFuelHelper));
$('apply-fuel').addEventListener('click', () => {
  const f = fuelEstimate();
  if (f === null) return;
  activeVehicle().values.fuel = f.toFixed(2);
  $('fuel').value = f.toFixed(2);
  update();
  $('fuel').focus();
});

/* ---------- Main update ---------- */

function update() {
  const all = results();
  renderSummary(all[state.active]);
  renderComparison(all);
  scheduleHashSave();
}

function renderSummary(res) {
  FIELD_IDS.forEach(id => {
    const bad = res.invalid.has(id);
    $(id).setAttribute('aria-invalid', bad);
    $(`${id}-error`).textContent = bad ? fieldMessage(id) : '';
  });
  $('summary-title').textContent = `${res.name}: estimated monthly cash cost`;
  if (!res.r) {
    $('total').textContent = '—';
    $('financed').textContent = '—';
    $('interest').textContent = '—';
    $('breakdown').innerHTML = '';
    $('difference').textContent = '';
    $('difference').hidden = true;
    $('status').textContent = res.invalid.size
      ? 'Check the highlighted fields to see an estimate.'
      : 'Please enter smaller values to calculate an estimate.';
    return;
  }
  const { r, v } = res;
  $('total').textContent = money(r.total);
  $('financed').textContent = money(r.financed);
  $('interest').textContent = money(r.interest);
  $('status').textContent = 'Updates as you type.';
  $('breakdown').innerHTML = CATEGORIES.map(c => `<div class="row"><span><i class="key" style="background:${c.color}"></i>${c.label}</span><strong>${money(c.get(v, r))}</strong></div>`).join('');
  $('difference').hidden = false;
  $('difference').textContent = r.payment > 0
    ? `That's ${money(r.running)} more per month than the loan payment alone.`
    : `No loan payment. Running costs alone are ${money(r.running)} per month.`;
}

/* ---------- Comparison: tiles, insight, charts, table ---------- */

function renderComparison(all) {
  const valid = all.filter(x => x.r);
  const H = state.horizon * 12;
  valid.forEach(x => { x.cash = cumulative(x.v, x.r, H); });

  renderInsight(all, valid);
  renderTiles(all, valid);
  renderBarChart(valid);
  renderLineChart(valid);
  renderTable(all, valid);
}

function lowest(list, key) {
  if (list.length < 2) return null;
  return list.reduce((best, x) => (key(x) < key(best) ? x : best), list[0]);
}

function renderInsight(all, valid) {
  const el = $('insight');
  if (all.length < 2) {
    el.textContent = 'Add another vehicle to compare. Try a used option or a different trim.';
    return;
  }
  if (valid.length < 2) {
    el.textContent = 'Fix the highlighted fields to compare your vehicles.';
    return;
  }
  const byCash = [...valid].sort((a, b) => a.cash - b.cash);
  const cheap = byCash[0], dear = byCash[byCash.length - 1];
  const byMonth = [...valid].sort((a, b) => a.r.total - b.r.total);
  let text = `Over ${years(state.horizon)}, ${cheap.name} would cost about ${money0(dear.cash - cheap.cash)} less in cash than ${dear.name}.`;
  if (byMonth[0] !== cheap) {
    text += ` ${byMonth[0].name} has the lowest monthly cost, but ${cheap.name} comes out ahead over this period.`;
  }
  el.textContent = text;
}

function renderTiles(all, valid) {
  const best = lowest(valid, x => x.r.total);
  $('tiles').innerHTML = all.map(x => {
    let sub;
    if (!x.r) sub = 'Check the highlighted fields';
    else if (!best) sub = `${money0(x.cash)} cash over ${years(state.horizon)}`;
    else if (Math.abs(x.r.total - best.r.total) < 0.005) sub = valid.every(y => Math.abs(y.r.total - best.r.total) < 0.005) ? 'Same monthly cost as the others' : '✓ Lowest monthly cost';
    else sub = `+${money(x.r.total - best.r.total)}/mo vs ${esc(best.name)}`;
    return `<button type="button" class="tile${x.index === state.active ? ' is-active' : ''}" data-index="${x.index}" aria-label="Edit ${esc(x.name)}">
      <span class="tile-name"><span class="swatch" style="background:${x.color}"></span>${esc(x.name)}</span>
      <span class="tile-value">${x.r ? money(x.r.total) : '—'}<small> / month</small></span>
      <span class="tile-sub">${sub}</span>
    </button>`;
  }).join('');
}
$('tiles').addEventListener('click', e => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  selectVehicle(Number(tile.dataset.index));
  $('tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// "Nice" axis step: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(range, count) {
  const raw = range / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}
function ticksFor(max, count) {
  if (!(max > 0)) return [0, 100];
  const step = niceStep(max, count);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(t);
  return ticks;
}
const tickLabel = (t, max) => (max >= 10000 ? moneyCompact(t) : money0(t));

function renderBarChart(valid) {
  $('bar-legend').innerHTML = CATEGORIES.map(c => `<li><i class="key" style="background:${c.color}"></i>${c.label}</li>`).join('');
  const el = $('bar-chart');
  if (!valid.length) { el.innerHTML = '<p class="empty">No valid vehicles to chart yet.</p>'; return; }
  const ticks = ticksFor(Math.max(...valid.map(x => x.r.total)), 4);
  const top = ticks[ticks.length - 1];
  const pct = n => (n / top) * 100;
  const grid = ticks.map(t => `<span class="gridline" style="left:${pct(t)}%"></span>`).join('');
  const rows = valid.map(x => {
    let left = 0;
    const segs = CATEGORIES.map((c, ci) => {
      const value = c.get(x.v, x.r);
      const seg = { c, ci, value, left };
      left += value;
      return seg;
    }).filter(s => s.value > 0).map((s, i) => {
      const share = x.r.total ? Math.round((s.value / x.r.total) * 100) : 0;
      const tip = `<strong>${esc(x.name)}</strong><br><i class="key" style="background:${s.c.color}"></i>${s.c.label}: ${money(s.value)} (${share}%)`;
      // 2px surface gap between touching segments, taken from the left edge of every segment after the first.
      return `<span class="seg" tabindex="0" role="img" aria-label="${esc(x.name)}, ${s.c.label}: ${money(s.value)}, ${share}%" data-tip="${esc(tip)}"
        style="left:calc(${pct(s.left)}% + ${i ? 2 : 0}px);width:calc(${pct(s.value)}% - ${i ? 2 : 0}px);background:${s.c.color}"></span>`;
    }).join('');
    return `<div class="bar-row">
      <span class="bar-label"><span class="swatch" style="background:${x.color}"></span>${esc(x.name)}</span>
      <div class="bar-track">${grid}<div class="bar" style="width:${pct(x.r.total)}%">${segs}</div></div>
      <span class="bar-total">${money0(x.r.total)}</span>
    </div>`;
  }).join('');
  const axis = `<div class="bar-row axis-row"><span class="bar-label"></span><div class="bar-axis">${ticks.map(t => `<span style="left:${pct(t)}%">${tickLabel(t, top)}</span>`).join('')}</div><span class="bar-total"></span></div>`;
  el.innerHTML = rows + axis;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let lineModel = null; // kept for the hover layer

function renderLineChart(valid) {
  const el = $('line-chart');
  $('horizon-value').textContent = years(state.horizon);
  $('line-legend').innerHTML = valid.length > 1
    ? valid.map(x => `<li><i class="line-key" style="background:${x.color}"></i>${esc(x.name)}</li>`).join('')
    : '';
  if (!valid.length) { el.innerHTML = '<p class="empty">No valid vehicles to chart yet.</p>'; lineModel = null; return; }

  const W = Math.max(280, el.clientWidth || 600);
  const narrow = W < 520;
  const M = state.horizon * 12;
  const m = { top: 14, right: narrow ? 14 : 150, bottom: 30, left: 58 };
  const H = narrow ? 240 : 300;
  const pw = W - m.left - m.right, ph = H - m.top - m.bottom;
  const ticks = ticksFor(Math.max(...valid.map(x => x.cash)), 4);
  const top = ticks[ticks.length - 1];
  const x = mo => m.left + (mo / M) * pw;
  const y = val => m.top + ph - (val / top) * ph;

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Cumulative cash cost over ${years(state.horizon)} for ${valid.map(v => esc(v.name)).join(', ')}. Values are listed in the full comparison table.">`;
  ticks.forEach(t => {
    svg += `<line class="${t === 0 ? 'baseline' : 'grid'}" x1="${m.left}" x2="${m.left + pw}" y1="${y(t)}" y2="${y(t)}"/>`;
    svg += `<text class="tick" x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${tickLabel(t, top)}</text>`;
  });
  const yStep = state.horizon > 6 && narrow ? 2 : 1;
  for (let yr = 0; yr <= state.horizon; yr += yStep) {
    svg += `<text class="tick" x="${x(yr * 12)}" y="${H - 8}" text-anchor="${yr === 0 ? 'start' : yr === state.horizon ? 'end' : 'middle'}">${yr === 0 ? 'Today' : `Yr ${yr}`}</text>`;
  }
  // Lines are piecewise linear: steeper while the loan runs, flatter after it is paid off.
  valid.forEach(v => {
    const pts = [0];
    if (v.v.loanTerm < M) pts.push(v.v.loanTerm);
    pts.push(M);
    const d = pts.map((mo, i) => `${i ? 'L' : 'M'}${x(mo).toFixed(1)},${y(cumulative(v.v, v.r, mo)).toFixed(1)}`).join('');
    svg += `<path class="series" d="${d}" stroke="${v.color}"/>`;
  });
  valid.forEach(v => {
    svg += `<circle class="end-dot" cx="${x(M)}" cy="${y(v.cash)}" r="4" fill="${v.color}"/>`;
  });
  // Direct end labels only when they have room and don't collide; otherwise legend + tooltip carry identity.
  if (!narrow) {
    const ys = valid.map(v => y(v.cash)).sort((a, b) => a - b);
    const collide = ys.some((yy, i) => i && yy - ys[i - 1] < 30);
    if (!collide) {
      valid.forEach(v => {
        const name = v.name.length > 18 ? `${v.name.slice(0, 17)}…` : v.name;
        svg += `<text class="end-label" x="${x(M) + 10}" y="${y(v.cash) - 2}">${esc(name)}</text>`;
        svg += `<text class="end-value" x="${x(M) + 10}" y="${y(v.cash) + 13}">${money0(v.cash)}</text>`;
      });
    }
  }
  svg += `<line class="crosshair" id="crosshair" x1="0" x2="0" y1="${m.top}" y2="${m.top + ph}" visibility="hidden"/>`;
  svg += `<g id="hover-dots"></g>`;
  svg += `<rect class="hit" x="${m.left}" y="${m.top}" width="${pw}" height="${ph}"/>`;
  svg += '</svg>';
  el.innerHTML = svg;
  lineModel = { valid, M, m, pw, x, y };
}

// Crosshair + tooltip for the line chart.
$('line-chart').addEventListener('pointermove', e => {
  if (!lineModel || !e.target.classList.contains('hit')) return;
  const svg = $('line-chart').querySelector('svg');
  const rect = svg.getBoundingClientRect();
  const scale = svg.viewBox.baseVal.width / rect.width;
  const px = (e.clientX - rect.left) * scale;
  const { valid, M, m, pw, x, y } = lineModel;
  const mo = Math.round(Math.min(Math.max((px - m.left) / pw, 0), 1) * M);
  const cross = $('crosshair');
  cross.setAttribute('x1', x(mo));
  cross.setAttribute('x2', x(mo));
  cross.setAttribute('visibility', 'visible');
  const rows = valid.map(v => ({ v, val: cumulative(v.v, v.r, mo) })).sort((a, b) => b.val - a.val);
  $('hover-dots').innerHTML = rows.map(({ v, val }) => `<circle class="end-dot" cx="${x(mo)}" cy="${y(val)}" r="4" fill="${v.color}"/>`).join('');
  const yr = Math.floor(mo / 12), rem = mo % 12;
  const when = mo === 0 ? 'Today' : `After ${yr ? years(yr) : ''}${yr && rem ? ', ' : ''}${rem ? `${rem} month${rem === 1 ? '' : 's'}` : ''}`;
  const html = `<strong>${when}</strong>` + rows.map(({ v, val }) =>
    `<br><i class="key" style="background:${v.color}"></i>${esc(v.name)}: ${money0(val)}${mo >= v.v.loanTerm && v.r.payment > 0 ? ' <span class="muted">(loan paid off)</span>' : ''}`).join('');
  showTip(html, e.clientX, e.clientY);
});
$('line-chart').addEventListener('pointerleave', () => {
  const cross = $('crosshair');
  if (cross) cross.setAttribute('visibility', 'hidden');
  const dots = $('hover-dots');
  if (dots) dots.innerHTML = '';
  hideTip();
});

// Tooltips for bar segments (mouse, touch and keyboard focus).
const barChart = $('bar-chart');
barChart.addEventListener('pointermove', e => {
  const seg = e.target.closest('.seg');
  if (seg) showTip(seg.dataset.tip, e.clientX, e.clientY); else hideTip();
});
barChart.addEventListener('pointerleave', hideTip);
barChart.addEventListener('focusin', e => {
  const seg = e.target.closest('.seg');
  if (!seg) return;
  const r = seg.getBoundingClientRect();
  showTip(seg.dataset.tip, r.left + r.width / 2, r.top);
});
barChart.addEventListener('focusout', hideTip);

function showTip(html, cx, cy) {
  const tip = $('tooltip');
  tip.innerHTML = html;
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = cx + 14, top = cy - h - 12;
  if (left + w > window.innerWidth - 8) left = cx - w - 14;
  if (left < 8) left = 8;
  if (top < 8) top = cy + 18;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
function hideTip() { $('tooltip').hidden = true; }

function renderTable(all, valid) {
  const H = state.horizon;
  const cell = (x, fn) => (x.r ? fn(x) : '—');
  const metrics = [
    { label: 'Vehicle price', fn: x => money0(x.v.price), field: 'price' },
    { label: 'Amount financed', fn: x => money0(x.r.financed) },
    { label: 'Loan term', fn: x => `${x.v.loanTerm} months`, field: 'loanTerm' },
    { label: 'Monthly loan payment', fn: x => money(x.r.payment) },
    { label: 'Monthly running costs', fn: x => money(x.r.running), key: x => x.r.running },
    { label: 'Total monthly cost', fn: x => money(x.r.total), key: x => x.r.total, strong: true },
    { label: 'Interest over the loan', fn: x => money0(x.r.interest), key: x => x.r.interest },
    { label: `Cash out over ${years(H)}`, fn: x => money0(x.cash), key: x => x.cash, strong: true }
  ];
  const head = `<thead><tr><th scope="col"><span class="sr-only">Metric</span></th>${all.map(x =>
    `<th scope="col"><span class="swatch" style="background:${x.color}"></span>${esc(x.name)}</th>`).join('')}</tr></thead>`;
  const body = metrics.map(mt => {
    const best = mt.key ? lowest(valid, mt.key) : null;
    // Only flag a winner when there is a real difference.
    const tie = best && valid.every(x => Math.abs(mt.key(x) - mt.key(best)) < 0.005);
    return `<tr${mt.strong ? ' class="strong"' : ''}><th scope="row">${mt.label}</th>${all.map(x => {
      const val = mt.field ? (x.invalid.has(mt.field) ? '—' : mt.fn(x)) : cell(x, mt.fn);
      const flag = best && !tie && x.r && Math.abs(mt.key(x) - mt.key(best)) < 0.005 ? ' <span class="best">✓ lowest</span>' : '';
      return `<td>${val}${flag}</td>`;
    }).join('')}</tr>`;
  }).join('');
  $('compare-table').innerHTML = head + `<tbody>${body}</tbody>`;
}

$('horizon').addEventListener('input', e => {
  state.horizon = Number(e.target.value);
  renderComparison(results());
  scheduleHashSave();
});

/* ---------- Share link (state in the URL hash) ---------- */

function encodeState() {
  const data = {
    a: state.active,
    h: state.horizon,
    v: state.vehicles.map(veh => ({ s: veh.slot, n: veh.name, f: FIELD_IDS.map(id => veh.values[id]) }))
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function loadFromHash() {
  const match = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  try {
    const bin = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    const seen = new Set();
    const vehicles = (data.v || []).slice(0, MAX_VEHICLES).filter(v => {
      const ok = [0, 1, 2].includes(v.s) && !seen.has(v.s) && Array.isArray(v.f) && v.f.length === FIELD_IDS.length;
      if (ok) seen.add(v.s);
      return ok;
    }).map(v => {
      const values = {};
      FIELD_IDS.forEach((id, i) => { values[id] = String(v.f[i]).slice(0, 20); });
      return { slot: v.s, name: String(v.n || '').slice(0, 40), values };
    });
    if (!vehicles.length) return null;
    const horizon = Math.min(10, Math.max(1, Math.round(Number(data.h)) || 5));
    const active = Math.min(vehicles.length - 1, Math.max(0, Math.round(Number(data.a)) || 0));
    return { active, horizon, vehicles };
  } catch {
    return null;
  }
}

let hashTimer = null;
function scheduleHashSave() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, '', `${location.pathname}${location.search}#s=${encodeState()}`);
  }, 300);
}

$('share').addEventListener('click', async () => {
  clearTimeout(hashTimer);
  const url = `${location.origin}${location.pathname}${location.search}#s=${encodeState()}`;
  history.replaceState(null, '', url);
  const btn = $('share');
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = '✓ Link copied';
  } catch {
    window.prompt('Copy this link to share your comparison:', url);
  }
  setTimeout(() => { btn.textContent = 'Copy share link'; }, 2000);
});

$('reset').addEventListener('click', () => {
  state = defaultState();
  $('horizon').value = state.horizon;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  selectVehicle(0);
});

window.addEventListener('hashchange', () => {
  const loaded = loadFromHash();
  if (!loaded) return;
  state = loaded;
  $('horizon').value = state.horizon;
  selectVehicle(state.active);
});

/* ---------- Responsive re-render ---------- */

let lastWidth = 0;
new ResizeObserver(entries => {
  const w = Math.round(entries[0].contentRect.width);
  if (w !== lastWidth) {
    lastWidth = w;
    renderLineChart(results().filter(x => x.r).map(x => ({ ...x, cash: cumulative(x.v, x.r, state.horizon * 12) })));
  }
}).observe($('line-chart'));

/* ---------- Start ---------- */

$('horizon').value = state.horizon;
updateFuelHelper();
selectVehicle(state.active);
