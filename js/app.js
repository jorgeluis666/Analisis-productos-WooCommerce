(function(){
const { parseCSV, parseXLSX, parseProducts, parseOrders, parseCustomers, detectType } = WCParser;
const { analyzeProducts, productBundleIdeas, analyzeOrders, orderBundleIdeas, monthlyTopProducts, analyzeCustomers } = WCAnalyzer;
const { hBar, vBar, lineChart, donut, yearCalendar, fmt, fmtMoney, fmtShort, escapeHtml, truncate, PALETTE, COLORS } = WCCharts;

const state = {
  productsFile:  null, productsData:  null, productsStats:  null,
  ordersFile:    null, ordersData:    null, ordersStats:    null,
  customersFile: null, customersData: null, customersStats: null,
  view: 'resumen',
  periodLabel: '',
  calendarYear: null,
  calendarMetric: 'orders'
};

// ===== Config del estudio =====
// Cuando tengas backend, rellena estas URLs. Mientras estén vacías, la contribución
// se queda en cola local y el benchmark muestra datos MOCK.
const CONFIG = {
  studyPostEndpoint:  '',   // POST payload anónimo — ej. 'https://api.limaretail.com/v1/wc-analyzer/contribute'
  studyFetchEndpoint: '',   // GET percentiles por industria+tamaño — ej. '...benchmarks?industry=X&size=Y'
  studyName: 'Estudio E-commerce Retail Perú 2026',
  organization: 'Lima Retail'
};

const INDUSTRIES = [
  {id:'moda-infantil', label:'Moda infantil / bebé'},
  {id:'moda-adulto', label:'Moda adulto'},
  {id:'hogar-decoracion', label:'Hogar y decoración'},
  {id:'belleza', label:'Belleza y cuidado personal'},
  {id:'comida-bebida', label:'Comida, bebida, gourmet'},
  {id:'electronica', label:'Electrónica / tecnología'},
  {id:'deportes', label:'Deportes y fitness'},
  {id:'salud', label:'Salud y farmacia'},
  {id:'mascotas', label:'Mascotas'},
  {id:'libros-papeleria', label:'Libros y papelería'},
  {id:'joyeria', label:'Joyería y accesorios'},
  {id:'arte-handmade', label:'Arte / handmade'},
  {id:'servicios', label:'Servicios'},
  {id:'otros', label:'Otros'}
];
function sizeBucketFromRevenue(totalRevenue){
  if(!totalRevenue || totalRevenue < 5000) return {id:'micro', label:'Micro · menos de S/ 5k'};
  if(totalRevenue < 30000) return {id:'pequeno', label:'Pequeño · S/ 5k – S/ 30k'};
  if(totalRevenue < 150000) return {id:'mediano', label:'Mediano · S/ 30k – S/ 150k'};
  if(totalRevenue < 500000) return {id:'grande', label:'Grande · S/ 150k – S/ 500k'};
  return {id:'enterprise', label:'Enterprise · > S/ 500k'};
}

// Datos MOCK para el benchmark mientras no hay backend real.
// Se reemplazarán por fetch al studyFetchEndpoint cuando esté disponible.
const MOCK_BENCHMARKS = {
  _default: {
    sampleSize: 18,
    avgTicket:               { p25: 120, p50: 185, p75: 265, p90: 420 },
    pareto80Pct:             { p25: 22,  p50: 33,  p75: 45,  p90: 58 },
    recurringPctOfActive:    { p25: 6,   p50: 14,  p75: 26,  p90: 42 },
    singleProductOrdersPct:  { p25: 52,  p50: 64,  p75: 75,  p90: 84 },
    top10PctShare:           { p25: 0.32,p50: 0.48,p75: 0.62,p90: 0.78 },
    avgItemsPerOrder:        { p25: 1.15,p50: 1.55,p75: 2.10,p90: 2.80 }
  },
  'moda-infantil': {
    sampleSize: 9,
    avgTicket:               { p25: 140, p50: 210, p75: 290, p90: 450 },
    pareto80Pct:             { p25: 28,  p50: 38,  p75: 50,  p90: 62 },
    recurringPctOfActive:    { p25: 8,   p50: 18,  p75: 32,  p90: 48 },
    singleProductOrdersPct:  { p25: 48,  p50: 60,  p75: 72,  p90: 82 },
    top10PctShare:           { p25: 0.36,p50: 0.52,p75: 0.66,p90: 0.80 },
    avgItemsPerOrder:        { p25: 1.25,p50: 1.75,p75: 2.35,p90: 3.10 }
  }
};

// ===== Consentimiento del estudio =====
const CONSENT_KEY = 'wc-analyzer-consent-v1';
function getConsent(){
  try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); }
  catch(e){ return null; }
}
function saveConsent(c){
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); }
  catch(e){ console.warn('saveConsent:', e.message); }
}

// Construye payload anónimo para el estudio.
// CRÍTICO: esta función NUNCA debe incluir nombres, emails, teléfonos, SKUs,
// títulos de producto/categoría específicos, direcciones o cualquier PII.
function buildContributionPayload(industry, sizeBucket){
  const payload = {
    version: 1,
    submittedAt: new Date().toISOString(),
    industry: industry || 'otros',
    sizeBucket: sizeBucket || 'micro',
    periodLabel: state.periodLabel || null
  };
  if(state.productsStats){
    const t = state.productsStats.totals;
    const top3Cat = state.productsStats.byCategory.slice(0,3).reduce((a,c)=>a+c.revenue, 0);
    payload.products = {
      totalProducts: t.totalProducts,
      productsWithSales: t.productsWithSales,
      totalRevenue: round2(t.totalRevenue),
      totalUnits: t.totalUnits,
      avgPrice: round2(t.averagePrice),
      pareto80Count: state.productsStats.pareto80,
      pareto80Pct: t.totalProducts ? round2(state.productsStats.pareto80 / t.totalProducts * 100) : 0,
      zeroSalesCount: state.productsStats.zeroSales.length,
      zeroSalesPct: t.totalProducts ? round2(state.productsStats.zeroSales.length / t.totalProducts * 100) : 0,
      outOfStockCount: state.productsStats.outOfStock.length,
      top3CategoriesShare: t.totalRevenue ? round2(top3Cat / t.totalRevenue) : 0,
      categoriesCount: state.productsStats.byCategory.length
    };
  }
  if(state.ordersStats){
    const o = state.ordersStats;
    const t = o.totals;
    const bd = [...o.byDow].sort((a,b)=>b.revenue-a.revenue)[0];
    payload.orders = {
      totalOrders: t.totalOrders,
      lineItems: t.lineItems,
      uniqueProducts: t.uniqueProducts,
      totalRevenue: round2(t.totalRevenue),
      avgTicket: round2(t.avgTicket),
      avgItemsPerOrder: round2(t.avgItemsPerOrder),
      avgDistinctPerOrder: round2(t.avgDistinctPerOrder),
      singleProductOrdersPct: t.totalOrders ? round2((o.distBuckets['1']||0) / t.totalOrders * 100) : 0,
      twoProductsOrdersPct:   t.totalOrders ? round2((o.distBuckets['2']||0) / t.totalOrders * 100) : 0,
      threeOrMoreOrdersPct:   t.totalOrders ? round2(((o.distBuckets['3']||0)+(o.distBuckets['4']||0)+(o.distBuckets['5+']||0)) / t.totalOrders * 100) : 0,
      pairsWithLiftGte1_5: o.pairs.filter(p => p.count >= 2 && p.lift >= 1.5).length,
      peakDayOfWeekIndex: bd ? bd.dow : null,
      peakDayShare: t.totalRevenue && bd ? round2(bd.revenue / t.totalRevenue) : 0
    };
  }
  if(state.customersStats){
    const c = state.customersStats;
    const topRegion = c.byRegion[0];
    payload.customers = {
      totalCustomers: c.total,
      activeCount: c.active.length,
      activePct: c.total ? round2(c.active.length / c.total * 100) : 0,
      recurringCount: c.recurring.length,
      recurringPctOfActive: c.active.length ? round2(c.recurring.length / c.active.length * 100) : 0,
      avgSpend: round2(c.avgSpend),
      avgVMP: round2(c.avgVMP),
      top10PctShare: round2(c.top10pctShare),
      atRiskCount: c.atRisk.length,
      atRiskPct: c.total ? round2(c.atRisk.length / c.total * 100) : 0,
      topRegionShare: c.totalSpend && topRegion ? round2(topRegion.revenue / c.totalSpend) : 0,
      citiesCount: c.byCity.length
    };
  }
  return payload;
}
function round2(n){ return Math.round((+n||0) * 100) / 100; }

function sendContribution(payload){
  if(!CONFIG.studyPostEndpoint){
    // Sin backend: almacena localmente la contribución para cuando se conecte.
    try {
      const queue = JSON.parse(localStorage.getItem('wc-analyzer-contrib-queue') || '[]');
      queue.push(payload);
      localStorage.setItem('wc-analyzer-contrib-queue', JSON.stringify(queue));
    } catch(e){}
    console.info('[Study] Contribución encolada localmente (backend no configurado):', payload);
    return Promise.resolve({ queued: true });
  }
  return fetch(CONFIG.studyPostEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => {
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return r.json().catch(() => ({ ok: true }));
  });
}

// ===== Persistence (localStorage) =====
const STORAGE_KEY = 'wc-analyzer-state-v1';
function saveState(){
  try {
    const payload = {
      productsFileName:  state.productsFile  ? state.productsFile.name  : null,
      productsData:      state.productsData,
      ordersFileName:    state.ordersFile    ? state.ordersFile.name    : null,
      ordersData:        state.ordersData,
      customersFileName: state.customersFile ? state.customersFile.name : null,
      customersData:     state.customersData,
      periodLabel:       state.periodLabel,
      view:              state.view,
      savedAt:           new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch(e){ console.warn('saveState:', e.message); }
}
function restoreState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const p = JSON.parse(raw);
    if(p.productsData && p.productsData.length){
      state.productsFile = { name: p.productsFileName || 'productos.csv' };
      state.productsData = p.productsData;
      state.productsStats = analyzeProducts(p.productsData);
    }
    if(p.ordersData && p.ordersData.lineItems && p.ordersData.lineItems.length){
      state.ordersFile = { name: p.ordersFileName || 'pedidos' };
      state.ordersData = p.ordersData;
      state.ordersStats = analyzeOrders(p.ordersData.lineItems);
    }
    if(p.customersData && p.customersData.length){
      state.customersFile = { name: p.customersFileName || 'clientes.csv' };
      state.customersData = p.customersData;
      state.customersStats = analyzeCustomers(p.customersData);
    }
    if(p.periodLabel) state.periodLabel = p.periodLabel;
    if(p.view) state.view = p.view;
    return !!(state.productsData || state.ordersData || state.customersData);
  } catch(e){
    console.warn('restoreState:', e.message);
    return false;
  }
}
function clearStoredState(){ try { localStorage.removeItem(STORAGE_KEY); } catch(e){} }

const root = document.getElementById('app');
const toast = document.getElementById('toast');
let toastT;
function showToast(msg, kind=''){
  toast.className = 'toast show ' + kind;
  toast.textContent = msg;
  clearTimeout(toastT);
  toastT = setTimeout(()=>{ toast.className = 'toast ' + kind; }, 3200);
}

// ===== SVG icons =====
const ICON = {
  home:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1v-9.5z"/></svg>',
  box:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3.3 8.3L12 13l8.7-4.7"/><path d="M12 22V13"/></svg>',
  tag:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/></svg>',
  bars:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="4" width="3" height="14"/></svg>',
  warehouse:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21V9l9-4 9 4v12"/><path d="M8 21v-8h8v8"/><path d="M11 13h2"/></svg>',
  gift:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="8" width="18" height="4"/><path d="M12 8v13"/><path d="M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8S13 3 16.5 3a2.5 2.5 0 0 1 0 5"/></svg>',
  bulb:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1 1 1.7V18h6v-1.6c0-.7.3-1.2 1-1.7A7 7 0 0 0 12 2z"/></svg>',
  upload:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  calendar:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  cart:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
  coins:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 6v12"/><path d="M15 9a3 3 0 0 0-3-1.5c-1.7 0-3 1-3 2.3 0 1.2 1 1.9 3 2.2s3 1 3 2.2c0 1.3-1.3 2.3-3 2.3a3.5 3.5 0 0 1-3-1.5"/></svg>',
  trend:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>',
  star:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="12 2 15.1 8.3 22 9.3 17 14.2 18.2 21 12 17.8 5.8 21 7 14.2 2 9.3 8.9 8.3"/></svg>',
  alert:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  scale:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 3v18"/><path d="M18 3v18"/><path d="M3 8h18"/><path d="M3 16h18"/></svg>',
  sheet:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  pin:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  people:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};

// ===== Render =====
function hasAnyData(){ return !!(state.productsData || state.ordersData || state.customersData); }
function hasOptedIn(){ const c = getConsent(); return c && c.decision === 'accepted'; }

// ===== Consent modal =====
let _modalEl = null;
function closeModal(){
  if(_modalEl){ document.body.removeChild(_modalEl); _modalEl = null; }
}
function showConsentModal(){
  if(_modalEl) return;
  const totalRev = state.productsStats ? state.productsStats.totals.totalRevenue
                 : state.ordersStats   ? state.ordersStats.totals.totalRevenue
                 : state.customersStats? state.customersStats.totalSpend : 0;
  const autoSize = sizeBucketFromRevenue(totalRev);
  const prev = getConsent() || {};

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-icon">${ICON.people}</div>
      <h3>Únete al ${escapeHtml(CONFIG.studyName)}</h3>
      <div class="modal-sub">
        Si aceptas contribuir, desbloqueas una pestaña <b>Benchmark</b> donde verás cómo te comparas contra otras marcas del mismo sector y tamaño —
        <b>sin ver nombres reales de nadie</b>. Son solo medianas y percentiles, datos de referencia.
      </div>

      <label>Tu industria</label>
      <select id="m-industry">
        ${INDUSTRIES.map(i => `<option value="${i.id}"${prev.industry===i.id?' selected':''}>${escapeHtml(i.label)}</option>`).join('')}
      </select>

      <label>Tamaño (auto-detectado)</label>
      <div class="modal-size-auto">${escapeHtml(autoSize.label)} <span style="color:#94A3B8">· basado en tus ingresos</span></div>

      <div class="modal-note ok">
        <b>Qué sí se envía (anónimo):</b>
        <ul>
          <li>Totales y promedios numéricos (ingresos, unidades, ticket medio)</li>
          <li>Distribuciones: % de catálogo que genera 80% de ingresos, recurrencia, etc.</li>
          <li>Industria y tamaño (que tú eliges arriba)</li>
        </ul>
      </div>
      <div class="modal-note no">
        <b>Qué NUNCA se envía:</b>
        <ul>
          <li>Nombres, emails, teléfonos o direcciones de tus clientes</li>
          <li>Nombres ni SKUs de tus productos</li>
          <li>Nombres de tus categorías ni tu marca</li>
        </ul>
      </div>

      <div class="btn-row">
        <button class="btn" id="m-decline">Solo uso privado</button>
        <button class="btn primary" id="m-accept">Contribuir y ver benchmarks</button>
      </div>
      <span class="modal-link" id="m-view-payload">Ver el JSON exacto que se enviaría</span>
    </div>
  `;
  document.body.appendChild(backdrop);
  _modalEl = backdrop;

  backdrop.querySelector('#m-decline').onclick = () => {
    saveConsent({ decision: 'declined', decidedAt: new Date().toISOString() });
    showToast('OK — los datos se procesan solo en tu navegador', 'ok');
    closeModal();
    render();
  };
  backdrop.querySelector('#m-accept').onclick = () => {
    const industry = backdrop.querySelector('#m-industry').value;
    const consent = { decision: 'accepted', industry, sizeBucket: autoSize.id, decidedAt: new Date().toISOString() };
    saveConsent(consent);
    const payload = buildContributionPayload(industry, autoSize.id);
    sendContribution(payload)
      .then(() => showToast('Gracias — contribución registrada. Revisa la pestaña Benchmark.', 'ok'))
      .catch(err => showToast('Contribución encolada (reintentará luego)', ''));
    closeModal();
    render();
  };
  backdrop.querySelector('#m-view-payload').onclick = () => {
    const industry = backdrop.querySelector('#m-industry').value;
    const payload = buildContributionPayload(industry, autoSize.id);
    alert('Esto es exactamente lo que se enviaría:\n\n' + JSON.stringify(payload, null, 2));
  };
  backdrop.addEventListener('click', e => { if(e.target === backdrop) closeModal(); });
}

function render(){
  root.innerHTML = '';
  root.appendChild(renderSidebar());
  const main = document.createElement('div');
  main.className = 'main';
  main.appendChild(renderTopbar());
  const content = document.createElement('div');
  content.className = 'content';
  if(!hasAnyData()){
    content.appendChild(renderDropHero());
  } else {
    content.appendChild(renderPeriodRow());
    content.appendChild(renderView());
    setTimeout(bindPostRender, 0);
  }
  main.appendChild(content);
  root.appendChild(main);
}

function bindPostRender(){
  const ySel = document.querySelector('#cal-year');
  const mSel = document.querySelector('#cal-metric');
  if(ySel) ySel.onchange = e => { state.calendarYear = e.target.value; render(); };
  if(mSel) mSel.onchange = e => { state.calendarMetric = e.target.value; render(); };
}

function renderSidebar(){
  const el = document.createElement('aside');
  el.className = 'sidebar';
  const hasAny = hasAnyData();
  const hasP = !!state.productsData;
  const hasO = !!state.ordersData;
  const hasC = !!state.customersData;
  const groups = [
    {lbl:'General', items:[
      {id:'resumen', label:'Resumen', icon:ICON.home, need:hasAny}
    ]},
    {lbl:'Productos', items:[
      {id:'productos', label:'Productos', icon:ICON.box, need:hasP},
      {id:'categorias', label:'Categorías', icon:ICON.tag, need:hasP},
      {id:'distribucion', label:'Distribución', icon:ICON.bars, need:hasP},
      {id:'inventario', label:'Inventario', icon:ICON.warehouse, need:hasP}
    ]},
    {lbl:'Pedidos', items:[
      {id:'temporal', label:'Temporal', icon:ICON.calendar, need:hasO},
      {id:'basket', label:'Co-compra', icon:ICON.cart, need:hasO},
      {id:'ticket', label:'Ticket promedio', icon:ICON.scale, need:hasO}
    ]},
    {lbl:'Clientes', items:[
      {id:'clientes', label:'Clientes', icon:ICON.star, need:hasC || hasO},
      {id:'geografia', label:'Geografía', icon:ICON.pin, need:hasC},
      {id:'recencia', label:'Recencia', icon:ICON.trend, need:hasC}
    ]},
    {lbl:'Estrategia', items:[
      {id:'bundles', label:'Bundles', icon:ICON.gift, need:hasAny},
      {id:'insights', label:'Insights', icon:ICON.bulb, need:hasAny},
      {id:'benchmark', label:'Benchmark', icon:ICON.scale, need:hasAny && hasOptedIn()}
    ]}
  ];
  // Auto-switch if current view is now disabled
  const flat = groups.flatMap(g => g.items);
  const currentEnabled = flat.find(it => it.id === state.view && it.need);
  if(!currentEnabled) state.view = (flat.find(it => it.need) || {id:'resumen'}).id;

  const sectionHtml = groups.map(g => `
    <div class="sidebar-section">
      <div class="sidebar-section-lbl">${escapeHtml(g.lbl)}</div>
      ${g.items.map(it => `<div class="sidebar-item${state.view===it.id?' active':''}${!it.need?' disabled':''}" data-id="${it.id}">${it.icon}<span>${it.label}</span></div>`).join('')}
    </div>
  `).join('');

  el.innerHTML = `
    <div class="sidebar-brand">
      <div class="title">WC Sales Analyzer</div>
      <div class="subtitle">Productos + Pedidos</div>
    </div>
    ${sectionHtml}
    <div class="sidebar-footer">Procesamiento 100% local · no sube datos</div>
  `;
  el.querySelectorAll('.sidebar-item').forEach(n => {
    if(n.classList.contains('disabled')) return;
    n.onclick = () => { state.view = n.dataset.id; render(); };
  });
  return el;
}

function renderTopbar(){
  const el = document.createElement('div');
  el.className = 'topbar';
  const hasAny = hasAnyData();
  const title = hasAny ? viewTitle(state.view) : 'WooCommerce Sales Analyzer';
  let subtitle;
  if(hasAny){
    const parts = [];
    if(state.periodLabel) parts.push(`<span class="topbar-pill">${ICON.calendar}${escapeHtml(state.periodLabel)}</span>`);
    if(state.productsData) parts.push(`<span class="topbar-pill">${ICON.box}${fmt(state.productsData.length)} productos</span>`);
    if(state.ordersData) parts.push(`<span class="topbar-pill">${ICON.cart}${fmt(state.ordersStats.totals.totalOrders)} pedidos · ${fmt(state.ordersStats.totals.lineItems)} líneas</span>`);
    if(state.customersData) parts.push(`<span class="topbar-pill">${ICON.people}${fmt(state.customersData.length)} clientes</span>`);
    subtitle = parts.join('');
  } else {
    subtitle = 'Análisis de ventas e-commerce · Productos + Pedidos';
  }
  el.innerHTML = `
    <div class="topbar-left">
      <div class="topbar-title">${escapeHtml(title)}</div>
      <div class="topbar-sub">${subtitle}</div>
    </div>
    <div class="topbar-right">
      ${hasAny ? `<button class="btn" id="btn-upload">${ICON.upload}<span>Subir archivo</span></button>
                  <button class="btn" id="btn-gs">${ICON.sheet}<span>Google Sheets</span></button>
                  <button class="btn" id="btn-study" title="Configurar participación en el estudio">${ICON.people}<span>${hasOptedIn()?'Estudio ✓':'Estudio'}</span></button>
                  <button class="btn danger" id="btn-reset">Reiniciar</button>` : ''}
      <input type="file" id="hidden-upload" accept=".csv,.xlsx,.xls,text/csv" multiple style="display:none">
    </div>
  `;
  const hidden = el.querySelector('#hidden-upload');
  const btnUp = el.querySelector('#btn-upload');
  if(btnUp) btnUp.onclick = () => hidden.click();
  const btnGS = el.querySelector('#btn-gs');
  if(btnGS) btnGS.onclick = () => {
    const url = prompt('Pega la URL de Google Sheets (debe estar compartido como "Cualquier persona con el enlace"):');
    if(url) loadFromGoogleSheets(url.trim());
  };
  const btnStudy = el.querySelector('#btn-study');
  if(btnStudy) btnStudy.onclick = () => {
    // Permite cambiar la decisión en cualquier momento
    const c = getConsent();
    if(c){
      if(confirm('Ya tomaste una decisión: "' + c.decision + '". ¿Quieres cambiarla?')){
        localStorage.removeItem(CONSENT_KEY);
        showConsentModal();
      }
    } else {
      showConsentModal();
    }
  };
  hidden.addEventListener('change', e => {
    if(e.target.files && e.target.files.length) handleFiles(e.target.files);
    hidden.value = '';
  });
  const reset = el.querySelector('#btn-reset');
  if(reset) reset.onclick = () => {
    if(!confirm('¿Borrar todos los datos cargados? Esto también limpia el guardado local.')) return;
    state.productsFile=null; state.productsData=null; state.productsStats=null;
    state.ordersFile=null; state.ordersData=null; state.ordersStats=null;
    state.customersFile=null; state.customersData=null; state.customersStats=null;
    state.periodLabel=''; state.view='resumen';
    clearStoredState();
    render();
  };
  return el;
}

function viewTitle(v){
  return {
    resumen:'Resumen',
    productos:'Productos',
    categorias:'Categorías',
    distribucion:'Distribución',
    inventario:'Inventario',
    temporal:'Análisis Temporal',
    basket:'Co-compra / Basket',
    ticket:'Ticket Promedio',
    clientes:'Clientes',
    geografia:'Distribución Geográfica',
    recencia:'Recencia y Retención',
    bundles:'Bundles',
    insights:'Insights',
    benchmark:'Benchmark del Sector'
  }[v] || 'Resumen';
}

function renderDropHero(){
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <label class="drop-hero">
      <input type="file" accept=".csv,.xlsx,.xls,text/csv" multiple style="display:none">
      <div class="upload-icon">${ICON.upload}</div>
      <h2>Sube tus archivos de WooCommerce</h2>
      <p>CSV o XLSX · puedes seleccionar varios a la vez</p>
      <div class="hint">
        <b>Productos</b>: Analíticas → Productos → Descargar CSV<br>
        <b>Pedidos</b>: export con fecha, cliente, artículo, coste<br>
        <b>Clientes</b>: Analíticas → Clientes → Descargar CSV<br>
        Se detecta el tipo automáticamente. Los datos quedan guardados<br>
        localmente — al recargar, siguen cargados.
      </div>
    </label>
    <div style="max-width:520px;margin:12px auto 0;display:flex;align-items:center;gap:10px">
      <div style="flex:1;height:1px;background:#E2E8F0"></div>
      <span style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em">o</span>
      <div style="flex:1;height:1px;background:#E2E8F0"></div>
    </div>
    <div style="max-width:520px;margin:12px auto 0;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:16px 18px">
      <div style="font-size:13px;font-weight:600;color:#0F172A;margin-bottom:4px">Importar desde Google Sheets</div>
      <div style="font-size:11px;color:#64748B;margin-bottom:10px">La hoja debe estar compartida como <b>"Cualquier persona con el enlace"</b></div>
      <div style="display:flex;gap:8px">
        <input id="gs-url" type="text" placeholder="https://docs.google.com/spreadsheets/d/…" style="flex:1;font-size:12px;padding:8px 10px;border:1px solid #CBD5E1;border-radius:7px;background:#F8FAFC;color:#0F172A">
        <button class="btn primary" id="gs-btn">Importar</button>
      </div>
    </div>
  `;
  const label = wrap.querySelector('.drop-hero');
  const input = wrap.querySelector('input[type=file]');
  input.addEventListener('change', e => {
    if(e.target.files && e.target.files.length) handleFiles(e.target.files);
    input.value = '';
  });
  label.addEventListener('dragover', e => { e.preventDefault(); label.classList.add('drag'); });
  label.addEventListener('dragleave', () => label.classList.remove('drag'));
  label.addEventListener('drop', e => {
    e.preventDefault(); label.classList.remove('drag');
    if(e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  const urlInput = wrap.querySelector('#gs-url');
  const urlBtn = wrap.querySelector('#gs-btn');
  urlBtn.addEventListener('click', () => loadFromGoogleSheets(urlInput.value.trim()));
  urlInput.addEventListener('keydown', e => { if(e.key === 'Enter') loadFromGoogleSheets(urlInput.value.trim()); });
  return wrap;
}

function renderPeriodRow(){
  const el = document.createElement('div');
  el.className = 'period-row';
  el.innerHTML = `
    <label>Periodo del reporte</label>
    <input type="text" placeholder="Ej. Ene – Mar 2026" value="${escapeHtml(state.periodLabel)}">
    <span class="help">Opcional · El CSV no incluye fechas, escribe aquí el rango como etiqueta.</span>
  `;
  const inp = el.querySelector('input');
  inp.addEventListener('change', e => { state.periodLabel = e.target.value.trim(); saveState(); render(); });
  return el;
}

function handleFile(file, onDone){
  const name = file.name.toLowerCase();
  const isXLSX = /\.(xlsx|xls)$/.test(name);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      let rows;
      if(isXLSX) rows = parseXLSX(reader.result);
      else       rows = parseCSV(reader.result);
      if(!rows || !rows.length){ showToast(`${file.name}: archivo vacío`, 'err'); onDone && onDone(); return; }
      const type = detectType(rows[0]);
      if(type === 'products'){
        const products = parseProducts(rows);
        if(!products.length){ showToast(`${file.name}: no pude leer productos`, 'err'); onDone && onDone(); return; }
        state.productsFile = { name: file.name };
        state.productsData = products;
        state.productsStats = analyzeProducts(products);
        showToast(`Productos cargados: ${products.length}`, 'ok');
      } else if(type === 'orders'){
        const ord = parseOrders(rows);
        if(!ord.lineItems.length){ showToast(`${file.name}: sin líneas de pedido`, 'err'); onDone && onDone(); return; }
        state.ordersFile = { name: file.name };
        state.ordersData = ord;
        state.ordersStats = analyzeOrders(ord.lineItems);
        showToast(`Pedidos cargados: ${state.ordersStats.totals.totalOrders}`, 'ok');
      } else if(type === 'customers'){
        const cust = parseCustomers(rows);
        if(!cust.length){ showToast(`${file.name}: no pude leer clientes`, 'err'); onDone && onDone(); return; }
        state.customersFile = { name: file.name };
        state.customersData = cust;
        state.customersStats = analyzeCustomers(cust);
        showToast(`Clientes cargados: ${cust.length}`, 'ok');
      } else {
        showToast(`${file.name}: tipo no reconocido`, 'err');
        onDone && onDone();
        return;
      }
      saveState();
      render();
      onDone && onDone();
    } catch(err){
      console.error(err);
      showToast(`Error con ${file.name}: ${err.message}`, 'err');
      onDone && onDone(err);
    }
  };
  if(isXLSX) reader.readAsArrayBuffer(file);
  else       reader.readAsText(file, 'utf-8');
}

// Sequential handler for multiple files at once (drag-drop or multi-select)
function handleFiles(fileList){
  const files = Array.from(fileList || []);
  if(!files.length) return;
  let i = 0;
  const next = () => {
    if(i >= files.length) return;
    const f = files[i++];
    handleFile(f, next);
  };
  next();
}

function loadFromGoogleSheets(url){
  if(!url){ showToast('Pega una URL válida', 'err'); return; }
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if(!m){ showToast('URL no reconocida. Debe ser una hoja de Google Sheets.', 'err'); return; }
  const sheetId = m[1];
  const gidMatch = url.match(/[#?&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  showToast('Importando desde Google Sheets…');
  fetch(exportUrl)
    .then(r => {
      if(!r.ok) throw new Error(`${r.status}. Verifica que la hoja esté compartida como "Cualquier persona con el enlace".`);
      return r.text();
    })
    .then(text => {
      const rows = parseCSV(text);
      if(!rows.length){ showToast('Hoja vacía', 'err'); return; }
      const type = detectType(rows[0]);
      const fakeFile = { name: `Google Sheets (${sheetId.slice(0,8)}…)` };
      if(type === 'products'){
        const products = parseProducts(rows);
        if(!products.length){ showToast('No pude leer productos de la hoja', 'err'); return; }
        state.productsFile = fakeFile;
        state.productsData = products;
        state.productsStats = analyzeProducts(products);
        showToast(`Productos cargados desde Google Sheets: ${products.length}`, 'ok');
      } else if(type === 'orders'){
        const ord = parseOrders(rows);
        if(!ord.lineItems.length){ showToast('No pude extraer líneas de pedido', 'err'); return; }
        state.ordersFile = fakeFile;
        state.ordersData = ord;
        state.ordersStats = analyzeOrders(ord.lineItems);
        showToast(`Pedidos cargados desde Google Sheets: ${state.ordersStats.totals.totalOrders}`, 'ok');
      } else if(type === 'customers'){
        const cust = parseCustomers(rows);
        if(!cust.length){ showToast('No pude leer clientes', 'err'); return; }
        state.customersFile = fakeFile;
        state.customersData = cust;
        state.customersStats = analyzeCustomers(cust);
        showToast(`Clientes cargados desde Google Sheets: ${cust.length}`, 'ok');
      } else {
        showToast('No se identificó el tipo (productos/pedidos/clientes) en la hoja', 'err');
        return;
      }
      saveState();
      render();
    })
    .catch(err => {
      console.error(err);
      showToast('Error de importación: ' + err.message, 'err');
    });
}

function renderView(){
  const el = document.createElement('div');
  switch(state.view){
    case 'resumen': el.innerHTML = viewResumen(); break;
    case 'productos': el.innerHTML = viewProductos(); break;
    case 'categorias': el.innerHTML = viewCategorias(); break;
    case 'distribucion': el.innerHTML = viewDistribucion(); break;
    case 'inventario': el.innerHTML = viewInventario(); break;
    case 'temporal': el.innerHTML = viewTemporal(); break;
    case 'basket': el.innerHTML = viewBasket(); break;
    case 'ticket': el.innerHTML = viewTicket(); break;
    case 'clientes': el.innerHTML = viewClientes(); break;
    case 'geografia': el.innerHTML = viewGeografia(); break;
    case 'recencia': el.innerHTML = viewRecencia(); break;
    case 'bundles': el.innerHTML = viewBundles(); break;
    case 'insights': el.innerHTML = viewInsights(); break;
    case 'benchmark': el.innerHTML = viewBenchmark(); break;
  }
  return el;
}

// ===== KPI helper =====
function kpi({label, value, sub, icon, color}){
  return `<div class="kpi-card">
    <div class="kpi-icon ${color||'blue'}">${ICON[icon]||''}</div>
    <div class="kpi-lbl">${escapeHtml(label)}</div>
    <div class="kpi-val">${value}</div>
    ${sub?`<div class="kpi-sub">${sub}</div>`:''}
  </div>`;
}

// ===== Views =====

function viewResumen(){
  let h = '';
  const sP = state.productsStats;
  const sO = state.ordersStats;

  // KPIs — prefer orders for ticket/avg (real), fallback to products
  if(sO){
    const t = sO.totals;
    h += `<div class="kpi-grid">
      ${kpi({label:'Ingresos (pedidos)', value:fmtMoney(t.totalRevenue), sub:`${fmt(t.totalOrders)} pedidos`, icon:'coins', color:'blue'})}
      ${kpi({label:'Ticket promedio', value:fmtMoney(t.avgTicket), sub:`${fmt(t.avgItemsPerOrder,2)} líneas/pedido`, icon:'scale', color:'green'})}
      ${kpi({label:'Líneas de venta', value:fmt(t.lineItems), sub:`${fmt(t.uniqueProducts)} productos distintos`, icon:'cart', color:'amber'})}
      ${kpi({label:'Rango', value:t.dateRange ? t.dateRange.from.toISOString().slice(0,10) : '—', sub:t.dateRange ? '→ '+t.dateRange.to.toISOString().slice(0,10) : '', icon:'calendar', color:'purple'})}
    </div>`;
  } else if(sP){
    const t = sP.totals;
    const estTicket = t.totalOrders > 0 ? t.totalRevenue / t.totalOrders : 0;
    h += `<div class="kpi-grid">
      ${kpi({label:'Ingresos', value:fmtMoney(t.totalRevenue), sub:`${fmt(t.totalProducts)} productos activos`, icon:'coins', color:'blue'})}
      ${kpi({label:'Unidades vendidas', value:fmt(t.totalUnits), sub:`Precio medio ${fmtMoney(t.averagePrice)}`, icon:'cart', color:'green'})}
      ${kpi({label:'% catálogo con ventas', value:`${t.totalProducts?(t.productsWithSales/t.totalProducts*100).toFixed(0):0}%`, sub:`${fmt(t.productsWithSales)}/${fmt(t.totalProducts)}`, icon:'trend', color:'amber'})}
      ${kpi({label:'Ticket estimado', value:fmtMoney(estTicket), sub:'lower bound', icon:'scale', color:'purple'})}
    </div>`;
  }

  // Customers block
  if(state.customersStats){
    const c = state.customersStats;
    h += `<div class="panel">
      <div class="panel-head"><div class="panel-title">Clientes</div><div class="panel-meta">${fmt(c.total)} totales · ${fmt(c.active.length)} activos</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px">
        <div><div style="font-size:20px;font-weight:600;color:#0F172A">${fmt(c.active.length)}</div><div style="font-size:11px;color:#94A3B8">activos (1+ pedido)</div></div>
        <div><div style="font-size:20px;font-weight:600;color:#0F172A">${fmt(c.recurring.length)}</div><div style="font-size:11px;color:#94A3B8">recurrentes (2+ pedidos)</div></div>
        <div><div style="font-size:20px;font-weight:600;color:#0F172A">${fmtMoney(c.avgSpend)}</div><div style="font-size:11px;color:#94A3B8">gasto prom./activo</div></div>
        <div><div style="font-size:20px;font-weight:600;color:#0F172A">${fmtMoney(c.avgVMP)}</div><div style="font-size:11px;color:#94A3B8">VMP promedio</div></div>
        <div><div style="font-size:20px;font-weight:600;color:#DC2626">${fmt(c.atRisk.length)}</div><div style="font-size:11px;color:#94A3B8">en riesgo</div></div>
      </div>
    </div>`;
  }

  // Year calendar (orders)
  if(sO && sO.byDay.length){
    h += renderYearCalendarBox();
  }

  // Monthly top products (orders)
  if(sO && state.ordersData){
    h += renderMonthlyTopBox();
  }

  // Pareto + top por ingresos/unidades (products)
  if(sP){
    h += `<div class="panel">
      <div class="panel-head"><div><div class="panel-title">Curva Pareto — concentración de ingresos (productos)</div><div class="panel-sub">Top 30 · barra azul = ingresos, línea ámbar = acumulado</div></div></div>
      <div class="chart-wrap">${paretoChart(sP.top)}</div>
    </div>`;
    h += `<div class="panel-grid">
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Top 10 productos por ingresos</div></div>
        ${hBar(sP.top.slice(0,10).map(p=>({label:p.title, value:p.revenue})), {color:COLORS.blue, valueFormatter:fmtMoney, maxRows:10})}
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title">Top 10 productos por unidades</div></div>
        ${hBar([...sP.top].sort((a,b)=>b.sold-a.sold).slice(0,10).map(p=>({label:p.title, value:p.sold})), {color:COLORS.green, valueFormatter:fmt, maxRows:10})}
      </div>
    </div>`;
  }

  return h;
}

function renderYearCalendarBox(){
  const s = state.ordersStats;
  const years = [...new Set(s.byDay.map(d => d.date.slice(0,4)))].sort();
  const defaultYear = years[years.length - 1];
  const year = state.calendarYear && years.includes(state.calendarYear) ? state.calendarYear : defaultYear;
  const metric = state.calendarMetric || 'orders';
  const yearData = s.byDay.filter(d => d.date.startsWith(year));
  const daysWithSales = yearData.length;
  const yTotal = yearData.reduce((a,d)=>({orders:a.orders+d.orders, revenue:a.revenue+d.revenue, units:a.units+d.units}), {orders:0,revenue:0,units:0});
  const bestDay = [...yearData].sort((a,b)=>b.revenue-a.revenue)[0];
  const yearOpts = years.map(y => `<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('');
  const metricOpts = [['orders','Pedidos'],['revenue','Ingresos']].map(([v,lbl]) =>
    `<option value="${v}"${v===metric?' selected':''}>${lbl}</option>`).join('');
  return `<div class="panel">
    <div class="panel-head">
      <div><div class="panel-title">Avance del año — días con compras</div><div class="panel-sub">Heatmap por día · intensidad según ${metric==='revenue'?'ingresos':'nº de pedidos'}</div></div>
      <div style="display:flex;gap:6px;align-items:center">
        <select id="cal-year" style="font-size:12px;padding:5px 8px;border:1px solid #CBD5E1;border-radius:7px">${yearOpts}</select>
        <select id="cal-metric" style="font-size:12px;padding:5px 8px;border:1px solid #CBD5E1;border-radius:7px">${metricOpts}</select>
      </div>
    </div>
    <div class="chart-wrap">${yearCalendar(s.byDay, { year: parseInt(year), metric })}</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid #F1F5F9">
      <div><div style="font-size:18px;font-weight:600;color:#0F172A">${fmt(daysWithSales)}</div><div style="font-size:11px;color:#94A3B8">días con ventas</div></div>
      <div><div style="font-size:18px;font-weight:600;color:#0F172A">${fmt(yTotal.orders)}</div><div style="font-size:11px;color:#94A3B8">pedidos en ${year}</div></div>
      <div><div style="font-size:18px;font-weight:600;color:#0F172A">${fmtMoney(yTotal.revenue)}</div><div style="font-size:11px;color:#94A3B8">ingresos en ${year}</div></div>
      <div><div style="font-size:14px;font-weight:600;color:#0F172A">${bestDay ? bestDay.date : '—'}</div><div style="font-size:11px;color:#94A3B8">${bestDay ? fmtMoney(bestDay.revenue)+' · mejor día' : ''}</div></div>
    </div>
  </div>`;
}

function renderMonthlyTopBox(){
  const monthly = monthlyTopProducts(state.ordersData.lineItems, 5);
  if(!monthly.length) return '';
  const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const fmtMonth = mk => { const [y,m] = mk.split('-'); return monthNames[parseInt(m)-1] + ' ' + y; };
  const reversed = [...monthly].reverse();
  let h = `<div class="panel"><div class="panel-head"><div class="panel-title">Top productos por mes</div><div class="panel-meta">${monthly.length} ${monthly.length===1?'mes':'meses'} con ventas</div></div>`;
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px">';
  for(const m of reversed){
    h += `<div style="border:1px solid #E2E8F0;border-radius:10px;padding:12px 14px;background:#FAFBFC">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:#0F172A">${fmtMonth(m.month)}</div>
        <div style="font-size:10px;color:#94A3B8">${fmt(m.orders)} pedidos</div>
      </div>
      <div style="display:flex;gap:14px;font-size:11px;color:#64748B;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #F1F5F9">
        <div><b style="color:#0F172A">${fmt(m.units)}</b> productos vendidos</div>
        <div><b style="color:#2563EB">${fmtMoney(m.revenue)}</b> facturado</div>
      </div>
      <table style="width:100%;font-size:11px">
        <tbody>
        ${m.topByRevenue.map((p,i) => `<tr>
          <td style="padding:3px 0;color:#94A3B8;width:14px">${i+1}</td>
          <td style="padding:3px 4px">${escapeHtml(truncate(p.product, 30))}</td>
          <td style="padding:3px 0;text-align:right;color:#475569;white-space:nowrap">${fmt(p.qty)}u · ${fmtMoney(p.revenue)}</td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }
  h += '</div></div>';
  return h;
}

function paretoChart(products){
  const sorted = [...products].filter(p => p.revenue > 0).sort((a,b)=>b.revenue-a.revenue);
  if(!sorted.length) return '<div class="empty">Sin datos</div>';
  const top = sorted.slice(0, 30);
  const total = sorted.reduce((a,p)=>a+p.revenue, 0);
  const width = 900, height = 280;
  const padL = 54, padR = 54, padT = 22, padB = 42;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...top.map(p=>p.revenue), 1);
  const bw = chartW / top.length;
  let svg = `<svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  for(let i=0;i<=4;i++){
    const y = padT + chartH - (chartH * i/4);
    svg += `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="#F1F5F9"/>`;
    svg += `<text x="${padL-6}" y="${y+3}" font-size="11" fill="#94A3B8" text-anchor="end">${fmtShort(max*i/4)}</text>`;
    svg += `<text x="${width-padR+6}" y="${y+3}" font-size="11" fill="#D97706" text-anchor="start">${(i*25)}%</text>`;
  }
  let acc = 0;
  const pts = [];
  top.forEach((p,i) => {
    const x = padL + i*bw + bw*0.18;
    const w = bw * 0.64;
    const hbar = (p.revenue / max) * chartH;
    const y = padT + chartH - hbar;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${hbar}" fill="#2563EB" opacity="0.85" rx="2"><title>${escapeHtml(p.title)}: ${fmtMoney(p.revenue)}</title></rect>`;
    acc += p.revenue;
    const pctY = padT + chartH - (acc/total) * chartH;
    pts.push([padL + i*bw + bw/2, pctY, acc/total, p.title]);
  });
  const path = pts.map((p,i)=>(i===0?'M':'L')+p[0]+','+p[1]).join(' ');
  svg += `<path d="${path}" fill="none" stroke="#D97706" stroke-width="2.5"/>`;
  pts.forEach(p => {
    svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#D97706"><title>${escapeHtml(p[3])}: ${(p[2]*100).toFixed(1)}% acum.</title></circle>`;
  });
  const y80 = padT + chartH - 0.8 * chartH;
  svg += `<line x1="${padL}" y1="${y80}" x2="${width-padR}" y2="${y80}" stroke="#DC2626" stroke-dasharray="4,3" stroke-width="1"/>`;
  svg += `<text x="${padL+4}" y="${y80-4}" font-size="11" fill="#DC2626" font-weight="600">Línea 80%</text>`;
  svg += '</svg>';
  const legend = `<div class="legend"><span><span class="dot" style="background:#2563EB"></span>Ingresos por producto</span><span><span class="dot" style="background:#D97706"></span>% acumulado</span></div>`;
  return svg + legend;
}

function viewProductos(){
  const s = state.productsStats;
  const top = s.top.slice(0, 15);
  let h = `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Top 15 por ingresos</div><div class="panel-sub">Ranking completo de productos con ventas</div></div></div>
    ${hBar(top.map(p=>({label:p.title, value:p.revenue})), {color:COLORS.blue, valueFormatter:fmtMoney, maxRows:15})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Top 15 por unidades</div></div>
    ${hBar([...s.top].sort((a,b)=>b.sold-a.sold).slice(0,15).map(p=>({label:p.title, value:p.sold})), {color:COLORS.green, valueFormatter:fmt, maxRows:15})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Tabla completa</div><div class="panel-meta">${s.top.length} productos</div></div>
    <div style="max-height:520px;overflow:auto"><table>
      <thead><tr><th>#</th><th>Producto</th><th class="r">Unidades</th><th class="r">Pedidos</th><th class="r">Ingresos</th><th class="r">Precio/u</th><th>Categorías</th></tr></thead>
      <tbody>
      ${s.top.map((p,i)=>`<tr>
        <td style="color:#94A3B8">${i+1}</td>
        <td>${escapeHtml(truncate(p.title,60))}</td>
        <td class="r">${fmt(p.sold)}</td>
        <td class="r">${fmt(p.orders)}</td>
        <td class="r" style="font-weight:600">${fmtMoney(p.revenue)}</td>
        <td class="r">${p.sold>0?fmtMoney(p.revenue/p.sold):'—'}</td>
        <td style="font-size:10px;color:#94A3B8">${escapeHtml(p.categories.slice(0,3).join(', '))}${p.categories.length>3?'…':''}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
  return h;
}

function viewCategorias(){
  const s = state.productsStats;
  const cats = s.byCategory.slice(0, 15);
  let h = `<div class="panel-grid">
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Top 15 por ingresos</div></div>
      ${hBar(cats.map(c=>({label:c.category, value:c.revenue})), {color:COLORS.blue, valueFormatter:fmtMoney, maxRows:15})}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Top 15 por unidades</div></div>
      ${hBar([...s.byCategory].sort((a,b)=>b.units-a.units).slice(0,15).map(c=>({label:c.category, value:c.units})), {color:COLORS.green, valueFormatter:v=>fmt(v,1), maxRows:15})}
    </div>
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Share de ingresos — top 6 categorías</div></div>
    ${donut(s.byCategory.slice(0,6).map(c=>({label:c.category, value:c.revenue})))}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Detalle por categoría</div></div>
    <div style="max-height:480px;overflow:auto"><table>
      <thead><tr><th>Categoría</th><th class="r">Productos</th><th class="r">Unidades</th><th class="r">Pedidos</th><th class="r">Ingresos</th></tr></thead>
      <tbody>
      ${s.byCategory.map(c=>`<tr>
        <td>${escapeHtml(c.category)}</td>
        <td class="r">${fmt(c.products)}</td>
        <td class="r">${fmt(c.units,1)}</td>
        <td class="r">${fmt(c.orders,1)}</td>
        <td class="r" style="font-weight:600">${fmtMoney(c.revenue)}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
  return h;
}

function viewDistribucion(){
  const s = state.productsStats;
  const clean = state.productsData.filter(p => !p.deleted);
  const buckets = {'0':0,'1':0,'2':0,'3':0,'4':0,'5-10':0,'11+':0};
  for(const p of clean){
    const o = p.orders;
    if(o === 0) buckets['0']++;
    else if(o === 1) buckets['1']++;
    else if(o === 2) buckets['2']++;
    else if(o === 3) buckets['3']++;
    else if(o === 4) buckets['4']++;
    else if(o <= 10) buckets['5-10']++;
    else buckets['11+']++;
  }
  const distItems = Object.entries(buckets).map(([k,v])=>({label:k, value:v}));
  const unitsB = {'0':0,'1-2':0,'3-5':0,'6-10':0,'11-20':0,'21+':0};
  for(const p of clean){
    const u = p.sold;
    if(u === 0) unitsB['0']++;
    else if(u <= 2) unitsB['1-2']++;
    else if(u <= 5) unitsB['3-5']++;
    else if(u <= 10) unitsB['6-10']++;
    else if(u <= 20) unitsB['11-20']++;
    else unitsB['21+']++;
  }
  const unitsItems = Object.entries(unitsB).map(([k,v])=>({label:k, value:v}));
  const revB = {'0':0,'1-100':0,'101-300':0,'301-500':0,'501-1000':0,'1000+':0};
  for(const p of clean){
    const r = p.revenue;
    if(r === 0) revB['0']++;
    else if(r <= 100) revB['1-100']++;
    else if(r <= 300) revB['101-300']++;
    else if(r <= 500) revB['301-500']++;
    else if(r <= 1000) revB['501-1000']++;
    else revB['1000+']++;
  }
  const revItems = Object.entries(revB).map(([k,v])=>({label:k, value:v}));
  let h = `<div class="panel-grid">
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Productos por nº de pedidos</div></div>
      ${vBar(distItems, {color:COLORS.blue})}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Productos por unidades vendidas</div></div>
      ${vBar(unitsItems, {color:COLORS.green})}
    </div>
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Productos por tramo de ingresos (S/)</div></div>
    ${vBar(revItems, {color:COLORS.amber, valueFormatter:fmt})}
  </div>`;
  h += `<div class="insight info"><b>Lectura:</b> <b>${buckets['1']}</b> productos vendieron en 1 solo pedido · <b>${buckets['0']}</b> no vendieron nada. Ataca los de 1 pedido con cross-sell y evalúa si los de 0 merecen seguir en el catálogo.</div>`;
  h += `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Concentración por categoría (top 10)</div><div class="panel-sub">Ingresos vs cantidad de productos</div></div></div>
    ${categoryHeatmap(s.byCategory.slice(0,10))}
  </div>`;
  h += `<div class="insight"><b>Pareto 80/20:</b> <b>${s.pareto80}</b> productos (${s.totals.totalProducts?(s.pareto80/s.totals.totalProducts*100).toFixed(1):0}%) generan el 80% de los ingresos.</div>`;
  return h;
}

function categoryHeatmap(cats){
  if(!cats.length) return '<div class="empty">Sin datos</div>';
  const width = 900, rowH = 32;
  const height = cats.length * rowH + 44;
  const padL = 200, padR = 110;
  const chartW = width - padL - padR;
  const maxRev = Math.max(...cats.map(c=>c.revenue),1);
  const maxProd = Math.max(...cats.map(c=>c.products),1);
  let svg = `<svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<text x="${padL}" y="18" font-size="11" fill="#64748B">Ingresos (azul) · Productos en catálogo (verde)</text>`;
  cats.forEach((c, i) => {
    const y = 30 + i * rowH;
    svg += `<text x="0" y="${y + rowH/2 + 3}" font-size="12" fill="#334155">${escapeHtml(truncate(c.category, 28))}</text>`;
    const wRev = (c.revenue / maxRev) * chartW;
    svg += `<rect x="${padL}" y="${y+3}" width="${wRev}" height="${rowH/2 - 4}" fill="#2563EB" opacity="0.85" rx="3"><title>${escapeHtml(c.category)}: ${fmtMoney(c.revenue)}</title></rect>`;
    svg += `<text x="${padL + wRev + 6}" y="${y + rowH/2 - 1}" font-size="11" fill="#475569">${fmtMoney(c.revenue)}</text>`;
    const wProd = (c.products / maxProd) * chartW;
    svg += `<rect x="${padL}" y="${y + rowH/2 + 2}" width="${wProd}" height="${rowH/2 - 4}" fill="#059669" opacity="0.85" rx="3"><title>${escapeHtml(c.category)}: ${c.products} productos</title></rect>`;
    svg += `<text x="${padL + wProd + 6}" y="${y + rowH - 2}" font-size="11" fill="#475569">${c.products} prod.</text>`;
  });
  svg += '</svg>';
  return svg;
}

function viewInventario(){
  const s = state.productsStats;
  let h = `<div class="kpi-grid-3">
    ${kpi({label:'Sin existencias', value:fmt(s.outOfStock.length), sub:'productos sin stock', icon:'alert', color:'red'})}
    ${kpi({label:'Stock bajo (≤2)', value:fmt(s.lowStock.length), sub:'requieren reposición', icon:'warehouse', color:'amber'})}
    ${kpi({label:'Sin ventas', value:fmt(s.zeroSales.length), sub:'productos del catálogo', icon:'box', color:'blue'})}
  </div>`;
  if(s.outOfStock.length){
    h += `<div class="insight warn"><b>Atención:</b> productos con ventas y marcados "Sin existencias". Repón o marca como descatalogado para no perder SEO ni traer tráfico a ficha vacía.</div>`;
  }
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Sin existencias — con ventas</div><div class="panel-meta">${s.outOfStock.length} productos</div></div>
    ${s.outOfStock.length ? simpleTable(s.outOfStock.map(p=>({n:p.title, u:p.sold, r:p.revenue, s:p.state})),['Producto','Uds','Ingresos','Estado']) : '<div class="empty">Sin productos en esta situación</div>'}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Stock bajo (≤2 unidades)</div><div class="panel-meta">${s.lowStock.length}</div></div>
    ${s.lowStock.length ? simpleTable(s.lowStock.map(p=>({n:p.title, u:p.sold, r:p.revenue, s:p.stock+' u.'})),['Producto','Ventas','Ingresos','Stock']) : '<div class="empty">Sin productos con stock bajo</div>'}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Sin ventas</div><div class="panel-meta">${s.zeroSales.length}</div></div>
    ${s.zeroSales.length ? simpleTable(s.zeroSales.slice(0,30).map(p=>({n:p.title, u:p.variations, r:0, s:p.state||'—'})),['Producto','Variaciones','—','Estado']) : '<div class="empty">Todos los productos vendieron</div>'}
    ${s.zeroSales.length>30?`<div style="font-size:11px;color:#94A3B8;margin-top:8px">Mostrando 30 de ${s.zeroSales.length}</div>`:''}
  </div>`;
  return h;
}

function simpleTable(rows, headers){
  return `<div style="max-height:360px;overflow:auto"><table>
    <thead><tr>${headers.map(h=>`<th${/(ingresos|uds|ventas|variac|stock)/i.test(h)?' class="r"':''}>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>
      <td>${escapeHtml(truncate(r.n,55))}</td>
      <td class="r">${fmt(r.u)}</td>
      <td class="r">${r.r ? fmtMoney(r.r) : '—'}</td>
      <td style="font-size:11px;color:#64748B">${escapeHtml(r.s)}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function viewBundles(){
  let h = '';
  const hasP = !!state.productsData;
  const hasO = !!state.ordersData;
  // Real co-purchase bundles first
  if(hasO){
    const ob = orderBundleIdeas(state.ordersStats.pairs, state.ordersStats.topProducts);
    if(ob.length){
      h += `<div class="insight ok"><b>Bundles basados en co-compra real.</b> Extraídos del archivo de pedidos — estos productos SÍ se compran juntos en la tienda. Prioriza estos.</div>`;
      h += '<div class="panel"><div class="panel-head"><div class="panel-title">Co-compra real</div><div class="panel-meta">'+ob.length+' pares</div></div>';
      h += ob.map(b => bundleCard(b, 'co-purchase')).join('');
      h += '</div>';
    }
  }
  if(hasP){
    const pb = productBundleIdeas(state.productsData);
    if(pb.length){
      h += `<div class="insight info"><b>Bundles sugeridos por co-ocurrencia de categoría.</b> Los productos más vendidos dentro de cada categoría — comparten colección o estación, candidatos naturales para empaquetar.</div>`;
      h += '<div class="panel"><div class="panel-head"><div class="panel-title">Por categoría</div><div class="panel-meta">'+pb.length+' sugerencias</div></div>';
      h += pb.slice(0, 12).map(b => bundleCard(b, 'category')).join('');
      h += '</div>';
    }
  }
  if(!h) h = '<div class="empty">No hay suficientes datos para sugerir bundles.</div>';
  h += `<div class="insight"><b>Aplicación:</b> en WooCommerce usa el plugin <i>Product Bundles</i> o <i>Force Sells</i> para crear estos packs con 5-10% de descuento, o como "Compra junto" en la ficha de producto.</div>`;
  return h;
}

function bundleCard(b, kind){
  const kindLabel = kind === 'co-purchase' ? 'Co-compra real' : 'Por categoría';
  const kindPill = kind === 'co-purchase' ? 'green' : 'blue';
  return `<div class="bundle-card">
    <div class="bundle-head">
      <div class="bundle-title">${escapeHtml(b.title)}</div>
      <span class="pill ${kindPill}">${kindLabel}</span>
    </div>
    <div class="bundle-items">${b.items.map(i=>`<span class="bundle-chip">${escapeHtml(truncate(i,40))}</span>`).join('')}</div>
    <div class="bundle-note">${escapeHtml(b.note)}</div>
  </div>`;
}

function viewInsights(){
  const ins = [];
  const hasP = !!state.productsStats;
  const hasO = !!state.ordersStats;
  const s = hasP ? state.productsStats : null;
  const t = s ? s.totals : null;
  const clean = hasP ? state.productsData.filter(p => !p.deleted) : [];
  if(hasP) ins.push({k:'ok', t:`Se analizaron <b>${t.totalProducts}</b> productos${t.deleted?` (${t.deleted} borrados excluidos)`:''}. Ingresos: <b>${fmtMoney(t.totalRevenue)}</b> · ${fmt(t.totalUnits)} unidades.`});
  if(hasP && s.pareto80 > 0){
    ins.push({k:'info', t:`<b>Pareto 80/20:</b> el ${(s.pareto80/t.totalProducts*100).toFixed(0)}% de productos (${s.pareto80} de ${t.totalProducts}) genera el 80% de los ingresos. Concentra ads, email y homepage en esos.`});
  }
  if(hasP){
    const premium = clean.filter(p => p.orders > 0 && p.orders <= 3 && p.revenue > t.averagePrice * 4).slice(0,3);
    if(premium.length) ins.push({k:'info', t:`<b>Productos premium low-volume:</b> ${premium.map(p=>p.title).join(', ')}. Pocos pedidos pero alto ticket — candidatos a ads de alto ROAS.`});
    const cheap = clean.filter(p => p.sold >= 2 && p.revenue/p.sold < t.averagePrice * 0.5).slice(0,3);
    if(cheap.length) ins.push({k:'info', t:`<b>Posibles productos "imán" (tripwire):</b> ${cheap.map(p=>p.title).join(', ')}. Precio bajo la media y buena rotación — ideales como regalo sobre S/ X o primera compra.`});
    const highPerfCats = s.byCategory.filter(c => c.products <= 5 && c.revenue > (s.byCategory[0]?.revenue || 0) * 0.08).slice(0,3);
    if(highPerfCats.length) ins.push({k:'info', t:`<b>Categorías con pocos productos y buen rendimiento:</b> ${highPerfCats.map(c=>c.category).join(', ')}. Ampliar catálogo aquí puede tener alto retorno.`});
    if(s.outOfStock.length) ins.push({k:'warn', t:`<b>${s.outOfStock.length} productos "Sin existencias"</b> tienen ventas registradas. Repón o descatalógalos para no perder tráfico SEO.`});
    if(s.zeroSales.length > t.totalProducts * 0.3) ins.push({k:'warn', t:`<b>${s.zeroSales.length} productos (${(s.zeroSales.length/t.totalProducts*100).toFixed(0)}%) no vendieron nada.</b> Revisa visibilidad, fotografía y precio — o considera podar.`});
    const onePedido = clean.filter(p => p.orders === 1).length;
    if(onePedido > t.totalProducts * 0.2) ins.push({k:'info', t:`<b>${onePedido} productos con 1 solo pedido.</b> Compradores únicos. Candidatos a cross-sell para forzar repetición.`});
    const topCat = s.byCategory[0];
    if(topCat) ins.push({k:'info', t:`<b>Categoría líder:</b> "${topCat.category}" con ${fmtMoney(topCat.revenue)} (${fmt(topCat.units,1)} uds, ${topCat.products} productos).`});
  }
  if(hasO){
    const so = state.ordersStats;
    const to = so.totals;
    ins.push({k:'ok', t:`<b>${fmt(to.totalOrders)} pedidos</b> analizados · ticket promedio <b>${fmtMoney(to.avgTicket)}</b> · ${fmt(to.avgItemsPerOrder,2)} líneas/pedido.`});
    const single = so.distBuckets['1'] || 0;
    if(single / to.totalOrders > 0.6){
      ins.push({k:'warn', t:`<b>${(single/to.totalOrders*100).toFixed(0)}% de pedidos son mono-producto.</b> Gran oportunidad: cross-sell, "compra junto", envío gratis desde X, bundles.`});
    }
    const strongPairs = so.pairs.filter(p => p.count >= 3 && p.lift >= 1.5);
    if(strongPairs.length) ins.push({k:'info', t:`<b>${strongPairs.length} pares con asociación fuerte</b> (lift ≥1.5, co-compras ≥3). Úsalos como bundle o "Recomendaciones" en ficha.`});
    const bd = [...so.byDow].sort((a,b)=>b.revenue-a.revenue)[0];
    const wd = [...so.byDow].sort((a,b)=>a.revenue-b.revenue)[0];
    if(bd && wd && bd.revenue > wd.revenue * 2){
      ins.push({k:'info', t:`<b>Pico en ${bd.name}</b> (${fmtMoney(bd.revenue)}) vs ${wd.name} (${fmtMoney(wd.revenue)}). Programa emails y ads para maximizar ese día.`});
    }
    // Recurrencia
    const custMap = new Map();
    for(const li of state.ordersData.lineItems){
      const k = li.customer || 'anon:' + li.orderId;
      custMap.set(k, (custMap.get(k) || new Set())).add(li.orderId);
    }
    const recurring = [...custMap.values()].filter(s => s.size >= 2).length;
    if(recurring > 0){
      ins.push({k:'ok', t:`<b>${recurring} clientes recurrentes</b> (2+ pedidos). Revisa pestaña Clientes y activa email de fidelización.`});
    }
  }
  if(hasP && hasO){
    ins.push({k:'info', t:`<b>Tip con ambos archivos:</b> los top productos de Pareto + pares de co-compra te dan las combinaciones más rentables. Móntalas como bundles con descuento suave.`});
  }
  if(state.customersStats){
    const c = state.customersStats;
    ins.push({k:'ok', t:`<b>${fmt(c.total)} clientes</b> analizados · ${fmt(c.active.length)} activos · gasto total <b>${fmtMoney(c.totalSpend)}</b>.`});
    ins.push({k:'info', t:`<b>Concentración VIP:</b> el top 10% (${fmt(c.top10pctCount)} clientes) genera <b>${(c.top10pctShare*100).toFixed(0)}%</b> de los ingresos (${fmtMoney(c.top10pctRevenue)}). Crea un tier premium para estos.`});
    if(c.atRisk.length){
      ins.push({k:'warn', t:`<b>${fmt(c.atRisk.length)} clientes en riesgo</b> — tienen 2+ pedidos pero llevan >90 días inactivos. Son los que más valen reactivar. Ve a la pestaña Recencia para la lista.`});
    }
    const topCity = c.byCity[0];
    if(topCity) ins.push({k:'info', t:`<b>Plaza principal:</b> "${topCity.key}" con ${fmt(topCity.customers)} clientes y ${fmtMoney(topCity.revenue)} en ingresos. Considera envíos gratis a ese distrito o geo-ads.`});
    const inactivePct = c.total ? ((c.recencyBuckets['91–180d']+c.recencyBuckets['181d+'])/c.total*100) : 0;
    if(inactivePct > 40){
      ins.push({k:'warn', t:`<b>${inactivePct.toFixed(0)}% de clientes inactivos (>90 días).</b> Arranca un flow de win-back: email 1 (recordatorio), email 2 (cupón 15%), email 3 (descuento agresivo).`});
    }
  }
  if(!ins.length) return '<div class="empty">Sube un archivo para ver insights.</div>';

  let h = '';
  h += '<div class="panel"><div class="panel-head"><div class="panel-title">Hallazgos clave</div></div>' +
       ins.map(i => `<div class="insight ${i.k==='ok'?'ok':i.k==='info'?'info':i.k==='warn'?'warn':''}">${i.t}</div>`).join('') +
       '</div>';

  // Acciones recomendadas (concretas, accionables)
  const actions = buildRecommendations();
  if(actions.length){
    h += `<div class="panel">
      <div class="panel-head"><div><div class="panel-title">Acciones recomendadas</div><div class="panel-sub">Prioridad ordenada por impacto estimado</div></div></div>
      ${actions.map((a,i)=>`<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #F1F5F9">
        <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:${a.priority==='alta'?'#DC2626':a.priority==='media'?'#D97706':'#2563EB'};color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center">${i+1}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:#0F172A;margin-bottom:3px">${escapeHtml(a.title)} <span class="pill ${a.priority==='alta'?'red':a.priority==='media'?'amber':'blue'}" style="margin-left:6px">${a.priority}</span></div>
          <div style="font-size:12px;color:#475569;line-height:1.5;margin-bottom:4px">${a.detail}</div>
          <div style="font-size:11px;color:#64748B"><b>Cómo:</b> ${escapeHtml(a.how)}</div>
        </div>
      </div>`).join('')}
    </div>`;
  }

  // Bundles — co-purchase reales + por categoría
  let bundles = [];
  if(state.ordersStats){
    const ob = orderBundleIdeas(state.ordersStats.pairs, state.ordersStats.topProducts);
    bundles = bundles.concat(ob.slice(0, 6).map(b => ({...b, kind: 'co-purchase'})));
  }
  if(state.productsData){
    const pb = productBundleIdeas(state.productsData);
    bundles = bundles.concat(pb.slice(0, 6).map(b => ({...b, kind: 'category'})));
  }
  if(bundles.length){
    h += `<div class="panel">
      <div class="panel-head"><div><div class="panel-title">Ideas de bundles</div><div class="panel-sub">Prioriza co-compra real sobre sugerencias por categoría</div></div><div class="panel-meta">${bundles.length} sugerencias</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
      ${bundles.map(b => `<div class="bundle-card" style="margin:0">
        <div class="bundle-head">
          <div class="bundle-title">${escapeHtml(b.title)}</div>
          <span class="pill ${b.kind==='co-purchase'?'green':'blue'}">${b.kind==='co-purchase'?'Co-compra real':'Por categoría'}</span>
        </div>
        <div class="bundle-items">${b.items.map(i=>`<span class="bundle-chip">${escapeHtml(truncate(i,36))}</span>`).join('')}</div>
        <div class="bundle-note">${escapeHtml(b.note)}</div>
      </div>`).join('')}
      </div>
    </div>`;
  }
  return h;
}

function buildRecommendations(){
  const acts = [];
  const sP = state.productsStats;
  const sO = state.ordersStats;
  const sC = state.customersStats;

  // 1. Recuperar clientes en riesgo
  if(sC && sC.atRisk && sC.atRisk.length){
    const recoverable = sC.atRisk.reduce((a,c)=>a+c.totalSpend, 0);
    acts.push({
      priority: 'alta',
      title: `Reactivar ${fmt(sC.atRisk.length)} clientes en riesgo`,
      detail: `Representan <b>${fmtMoney(recoverable)}</b> en gasto histórico. Son más fáciles y rentables de recuperar que captar nuevos.`,
      how: 'Flow de 3 emails: recordatorio + cupón 15% a 7 días + descuento agresivo a 14 días. Lista completa en pestaña Recencia.'
    });
  }

  // 2. Podar catálogo muerto
  if(sP && sP.zeroSales.length > sP.totals.totalProducts * 0.3){
    acts.push({
      priority: 'media',
      title: `Revisar ${fmt(sP.zeroSales.length)} productos sin ventas`,
      detail: `El <b>${(sP.zeroSales.length/sP.totals.totalProducts*100).toFixed(0)}%</b> del catálogo no vendió en el periodo. Diluye el foco y complica la navegación.`,
      how: 'Audita fotografía, precio y visibilidad. Descataloga los que no aporten o redirígelos (301) al producto equivalente más vendido.'
    });
  }

  // 3. Stock de Pareto al día
  if(sP && sP.outOfStock.length){
    const topOut = sP.outOfStock.filter(p => p.revenue > sP.totals.averagePrice * 3);
    if(topOut.length){
      acts.push({
        priority: 'alta',
        title: `Reponer ${fmt(topOut.length)} productos top agotados`,
        detail: `Productos con ventas altas marcados "Sin existencias". Cada día sin stock es venta perdida para competencia.`,
        how: `Prioriza reposición de: ${topOut.slice(0,3).map(p=>p.title).join(', ')}.`
      });
    }
  }

  // 4. Cross-sell / bundles
  if(sO){
    const single = sO.distBuckets['1'] || 0;
    if(single / sO.totals.totalOrders > 0.6){
      acts.push({
        priority: 'alta',
        title: 'Subir ticket medio con cross-sell',
        detail: `<b>${(single/sO.totals.totalOrders*100).toFixed(0)}%</b> de pedidos son mono-producto. Ticket actual: ${fmtMoney(sO.totals.avgTicket)}.`,
        how: 'Activa (1) pop-up "compra junto" al añadir al carrito con los pares de mayor lift, (2) envío gratis desde S/ 250 — fija el umbral ~1.3× ticket medio.'
      });
    }
  } else if(sP){
    // Sin pedidos, derivar de productos
    const catalogMono = sP.top.filter(p => p.orders === p.sold && p.orders > 3).length;
    if(catalogMono > 5){
      acts.push({
        priority: 'media',
        title: 'Implementar bundles por categoría',
        detail: 'Hay suficientes productos con rotación buena para armar packs. Ver sugerencias abajo.',
        how: 'Instala plugin Product Bundles o Force Sells. Arma 3-5 packs con 5-10% de descuento como prueba.'
      });
    }
  }

  // 5. Campaña día pico
  if(sO && sO.byDow && sO.byDow.length){
    const bd = [...sO.byDow].sort((a,b)=>b.revenue-a.revenue)[0];
    const wd = [...sO.byDow].sort((a,b)=>a.revenue-b.revenue)[0];
    if(bd && wd && bd.revenue > wd.revenue * 2){
      acts.push({
        priority: 'media',
        title: `Concentrar marketing en ${bd.name}`,
        detail: `${bd.name} genera ${fmtMoney(bd.revenue)} vs ${fmtMoney(wd.revenue)} en ${wd.name} — 2× de diferencia.`,
        how: `Programa email blast el ${bd.name} a las 10am. Sube bid de ads 20% en ese día. Bloquea "no descuentos ${wd.name}" (no empujes sin demanda).`
      });
    }
  }

  // 6. Concentración VIP
  if(sC && sC.top10pctShare > 0.5){
    acts.push({
      priority: 'alta',
      title: `Crear programa VIP para ${fmt(sC.top10pctCount)} clientes top`,
      detail: `El 10% superior genera <b>${(sC.top10pctShare*100).toFixed(0)}%</b> de los ingresos (${fmtMoney(sC.top10pctRevenue)}). Si pierdes uno, duele mucho.`,
      how: 'Tier "VIP" con: envío gratis siempre, acceso anticipado a colecciones, regalo sorpresa cada 3 pedidos. Segmenta por email o tag en WooCommerce.'
    });
  }

  // 7. Plaza principal → geo-targeting
  if(sC && sC.byCity && sC.byCity[0]){
    const tc = sC.byCity[0];
    const share = sC.totalSpend ? tc.revenue/sC.totalSpend : 0;
    if(share > 0.25){
      acts.push({
        priority: 'media',
        title: `Aprovechar plaza principal: ${tc.key}`,
        detail: `${fmt(tc.customers)} clientes y ${fmtMoney(tc.revenue)} (${(share*100).toFixed(0)}% del total) vienen de "${tc.key}".`,
        how: 'Considera "envío gratis" exclusivo para esa zona, geo-ads (Meta/Google) segmentados, o partnership con courier local para delivery mismo día.'
      });
    }
  }

  // 8. Pareto focus
  if(sP && sP.pareto80 > 0){
    const top = sP.top.slice(0, sP.pareto80);
    acts.push({
      priority: 'media',
      title: `Enfocar esfuerzo en ${sP.pareto80} productos Pareto`,
      detail: `El <b>${(sP.pareto80/sP.totals.totalProducts*100).toFixed(0)}%</b> del catálogo genera el 80% de los ingresos. Ese es tu verdadero negocio.`,
      how: `Sube ads solo para ellos, mejora sus fotos/descripciones, y asegura que estén en homepage. Ejemplos: ${top.slice(0,3).map(p=>p.title).join(', ')}.`
    });
  }

  // priority sort: alta > media > baja
  const prio = {alta:0, media:1, baja:2};
  return acts.sort((a,b) => (prio[a.priority]||9) - (prio[b.priority]||9));
}

// ===== Orders views =====

function viewTemporal(){
  const s = state.ordersStats;
  const t = s.totals;
  let h = `<div class="kpi-grid">
    ${kpi({label:'Pedidos', value:fmt(t.totalOrders), sub:`${fmt(t.lineItems)} líneas`, icon:'cart', color:'blue'})}
    ${kpi({label:'Ingresos', value:fmtMoney(t.totalRevenue), sub:`Ticket medio ${fmtMoney(t.avgTicket)}`, icon:'coins', color:'green'})}
    ${kpi({label:'Días con ventas', value:fmt(s.byDay.length), sub:`sobre ${t.dateRange ? Math.round((t.dateRange.to-t.dateRange.from)/86400000)+1 : '?'} del rango`, icon:'calendar', color:'amber'})}
    ${kpi({label:'Prom. diario', value:fmtMoney(s.byDay.length ? t.totalRevenue / s.byDay.length : 0), sub:`${fmt(s.byDay.length ? t.totalOrders/s.byDay.length : 0, 1)} pedidos/día`, icon:'trend', color:'purple'})}
  </div>`;
  // Calendar first
  if(s.byDay.length) h += renderYearCalendarBox();
  // Line charts
  const useMonth = s.byDay.length > 60;
  const series = useMonth ? s.byMonth : s.byDay;
  const xKey = useMonth ? 'month' : 'date';
  h += `<div class="panel-grid">
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Ingresos por ${useMonth?'mes':'día'}</div></div>
      ${lineChart(series.map(d=>({x:d[xKey].slice(useMonth?0:5), y:d.revenue})), {color:COLORS.blue, valueFormatter:fmtMoney})}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Pedidos por ${useMonth?'mes':'día'}</div></div>
      ${lineChart(series.map(d=>({x:d[xKey].slice(useMonth?0:5), y:d.orders})), {color:COLORS.green})}
    </div>
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Ingresos por día de la semana</div></div>
    ${vBar(s.byDow.map(d=>({label:d.name, value:d.revenue})), {color:COLORS.amber, valueFormatter:fmtMoney})}
  </div>`;
  const bestDay = [...s.byDay].sort((a,b)=>b.revenue-a.revenue)[0];
  const bestDow = [...s.byDow].sort((a,b)=>b.revenue-a.revenue)[0];
  const worstDow = [...s.byDow].sort((a,b)=>a.revenue-b.revenue)[0];
  if(bestDay) h += `<div class="insight info"><b>Día con más ingresos:</b> ${bestDay.date} · ${fmtMoney(bestDay.revenue)} en ${bestDay.orders} pedidos.</div>`;
  if(bestDow && worstDow && bestDow.revenue > worstDow.revenue*1.3){
    h += `<div class="insight"><b>${bestDow.name}</b> concentra más ingresos (${fmtMoney(bestDow.revenue)}) vs ${worstDow.name} (${fmtMoney(worstDow.revenue)}). Posible día clave para campañas.</div>`;
  }
  return h;
}

function viewBasket(){
  const s = state.ordersStats;
  const pairs = s.pairs.slice(0, 30);
  let h = `<div class="kpi-grid-3">
    ${kpi({label:'Pares co-comprados', value:fmt(s.pairs.length), sub:'pares distintos', icon:'cart', color:'blue'})}
    ${kpi({label:'Pares con ≥2 co-compras', value:fmt(s.pairs.filter(p=>p.count>=2).length), sub:'señal mínima', icon:'trend', color:'green'})}
    ${kpi({label:'Pares con lift ≥2×', value:fmt(s.pairs.filter(p=>p.lift>=2).length), sub:'asociación fuerte', icon:'star', color:'amber'})}
  </div>`;
  if(!pairs.length){
    h += '<div class="empty">No hay pedidos con más de 1 producto distinto.</div>';
    return h;
  }
  h += `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Top 30 pares de productos co-comprados</div><div class="panel-sub">Ordenados por frecuencia · muestra asociaciones reales en mismo pedido</div></div></div>
    <div style="max-height:540px;overflow:auto"><table>
      <thead><tr><th>#</th><th>Producto A</th><th>Producto B</th><th class="r">Juntos</th><th class="r">Lift</th><th class="r">Confianza</th></tr></thead>
      <tbody>
      ${pairs.map((p,i)=>`<tr>
        <td style="color:#94A3B8">${i+1}</td>
        <td>${escapeHtml(truncate(p.a,42))}</td>
        <td>${escapeHtml(truncate(p.b,42))}</td>
        <td class="r" style="font-weight:600">${fmt(p.count)}</td>
        <td class="r">${p.lift.toFixed(2)}×</td>
        <td class="r">${(p.confidence*100).toFixed(0)}%</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
  h += `<div class="insight info"><b>¿Cómo leerlo?</b> <b>Juntos</b> = veces en mismo pedido. <b>Lift</b> = cuánto más probable es co-compra vs. azar (≥1.5 es señal). <b>Confianza</b> = si uno está en el pedido, qué % tiene el otro.</div>`;
  return h;
}

function viewTicket(){
  const s = state.ordersStats;
  const t = s.totals;
  const distEntries = Object.entries(s.distBuckets);
  const dist = distEntries.map(([k,v])=>({label:k+(k==='1'?' prod.':' prod.'), value:v}));
  const bySize = s.ticketBySize;
  let h = `<div class="kpi-grid">
    ${kpi({label:'Ticket promedio', value:fmtMoney(t.avgTicket), sub:`${fmt(t.totalOrders)} pedidos`, icon:'scale', color:'blue'})}
    ${kpi({label:'Items promedio', value:fmt(t.avgItemsPerOrder,2), sub:'líneas por pedido', icon:'cart', color:'green'})}
    ${kpi({label:'Prod. distintos prom.', value:fmt(t.avgDistinctPerOrder,2), sub:'productos únicos/pedido', icon:'box', color:'amber'})}
    ${kpi({label:'Ingresos totales', value:fmtMoney(t.totalRevenue), icon:'coins', color:'purple'})}
  </div>`;
  h += `<div class="panel-grid">
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Distribución de pedidos por nº de productos distintos</div></div>
      ${vBar(dist, {color:COLORS.blue})}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Ticket promedio por tamaño de pedido</div></div>
      ${vBar(bySize.map(b=>({label:b.size+' p.', value:b.avgTicket})), {color:COLORS.green, valueFormatter:fmtMoney})}
    </div>
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Detalle por tamaño de pedido</div></div>
    <table>
      <thead><tr><th>Productos distintos</th><th class="r">Pedidos</th><th class="r">% del total</th><th class="r">Ticket promedio</th><th class="r">Ingresos</th></tr></thead>
      <tbody>${bySize.map(b=>`<tr>
        <td>${escapeHtml(b.size)}</td>
        <td class="r">${fmt(b.orders)}</td>
        <td class="r">${t.totalOrders?(b.orders/t.totalOrders*100).toFixed(1):'0'}%</td>
        <td class="r">${fmtMoney(b.avgTicket)}</td>
        <td class="r">${fmtMoney(b.revenue)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
  const singleShare = t.totalOrders ? s.distBuckets['1'] / t.totalOrders : 0;
  if(singleShare > 0.6){
    h += `<div class="insight warn"><b>${(singleShare*100).toFixed(0)}% de pedidos son de 1 solo producto.</b> Oportunidad clara de cross-sell y bundles para subir el ticket medio.</div>`;
  } else if(singleShare < 0.3){
    h += `<div class="insight ok"><b>Solo ${(singleShare*100).toFixed(0)}% de pedidos son mono-producto.</b> Buena tasa de cross-sell.</div>`;
  }
  return h;
}

function viewClientes(){
  // Prefer customers CSV (richer) over line-item derivation
  if(state.customersStats) return viewClientesFromCSV();
  if(state.ordersData) return viewClientesFromOrders();
  return '<div class="empty">Sube un archivo de Clientes o Pedidos para ver este análisis.</div>';
}

function viewClientesFromCSV(){
  const s = state.customersStats;
  const activePct = s.total ? (s.active.length/s.total*100).toFixed(0) : 0;
  const recPct = s.active.length ? (s.recurring.length/s.active.length*100).toFixed(0) : 0;
  let h = `<div class="kpi-grid">
    ${kpi({label:'Clientes totales', value:fmt(s.total), sub:`${fmt(s.active.length)} activos · ${activePct}%`, icon:'people', color:'blue'})}
    ${kpi({label:'Recurrentes', value:fmt(s.recurring.length), sub:`${recPct}% de activos (2+ pedidos)`, icon:'trend', color:'green'})}
    ${kpi({label:'Gasto total', value:fmtMoney(s.totalSpend), sub:`Prom. ${fmtMoney(s.avgSpend)}/cliente`, icon:'coins', color:'amber'})}
    ${kpi({label:'VMP promedio', value:fmtMoney(s.avgVMP), sub:'ticket medio por pedido', icon:'scale', color:'purple'})}
  </div>`;
  h += `<div class="insight info"><b>Concentración:</b> el <b>top ${fmt(s.top10pctCount)}</b> (10% superior) genera <b>${fmtMoney(s.top10pctRevenue)}</b> — un <b>${(s.top10pctShare*100).toFixed(0)}%</b> de todos los ingresos. Son tu segmento VIP.</div>`;
  if(s.atRisk.length){
    h += `<div class="insight warn"><b>${fmt(s.atRisk.length)} clientes en riesgo:</b> tienen 2+ pedidos pero más de 90 días sin actividad. Reactívalos con un email personalizado o cupón.</div>`;
  }
  h += `<div class="panel-grid">
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Distribución de pedidos por cliente</div></div>
      ${vBar(Object.entries(s.orderBuckets).map(([k,v])=>({label:k, value:v})), {color:COLORS.blue})}
    </div>
    <div class="panel">
      <div class="panel-head"><div class="panel-title">Distribución de VMP (S/ por pedido)</div></div>
      ${vBar(Object.entries(s.vmpBuckets).map(([k,v])=>({label:k, value:v})), {color:COLORS.green})}
    </div>
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Top 15 clientes por gasto</div><div class="panel-sub">Extraído directamente del CSV</div></div></div>
    ${hBar(s.topByRevenue.slice(0,15).map(c=>({label:(c.name||c.email), value:c.totalSpend})), {color:COLORS.blue, valueFormatter:fmtMoney, maxRows:15})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Top 15 clientes por nº de pedidos</div></div>
    ${hBar(s.topByOrders.slice(0,15).map(c=>({label:(c.name||c.email), value:c.orders})), {color:COLORS.green, valueFormatter:fmt, maxRows:15})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Tabla completa (top 50)</div><div class="panel-meta">${fmt(s.total)} totales</div></div>
    <div style="max-height:520px;overflow:auto"><table>
      <thead><tr><th>#</th><th>Cliente</th><th>Email</th><th>Distrito</th><th class="r">Pedidos</th><th class="r">VMP</th><th class="r">Gasto total</th><th>Última act.</th></tr></thead>
      <tbody>
      ${s.topByRevenue.slice(0,50).map((c,i)=>`<tr>
        <td style="color:#94A3B8">${i+1}</td>
        <td>${escapeHtml(truncate(c.name || '—', 26))}</td>
        <td style="font-size:11px;color:#64748B">${escapeHtml(truncate(c.email || '—', 30))}</td>
        <td style="font-size:11px;color:#64748B">${escapeHtml(c.city || c.postal || '—')}</td>
        <td class="r">${c.orders}</td>
        <td class="r">${fmtMoney(c.vmp)}</td>
        <td class="r" style="font-weight:600">${fmtMoney(c.totalSpend)}</td>
        <td style="font-size:11px;color:#64748B">${escapeHtml((c.lastActivity||'').slice(0,10))}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
  return h;
}

function viewClientesFromOrders(){
  const lineItems = state.ordersData.lineItems;
  const custMap = new Map();
  for(const li of lineItems){
    const key = li.customer || ('sin-email:' + (li.firstName||'?')+' '+(li.lastName||''));
    if(!custMap.has(key)) custMap.set(key, { key, name: (li.firstName||'') + ' ' + (li.lastName||''), email: li.customer, orders: new Set(), revenue: 0, items: 0 });
    const c = custMap.get(key);
    c.orders.add(li.orderId); c.revenue += li.total; c.items += li.qty;
  }
  const customers = [...custMap.values()].map(c => ({...c, orderCount: c.orders.size, orders: undefined})).sort((a,b)=>b.revenue-a.revenue);
  const totalRev = customers.reduce((a,c)=>a+c.revenue,0);
  const recurring = customers.filter(c => c.orderCount >= 2);
  const top10Rev = customers.slice(0,10).reduce((a,c)=>a+c.revenue,0);
  let h = `<div class="insight info" style="font-size:11px"><b>Vista reducida</b> — derivada del archivo de pedidos. Sube el CSV de Clientes para datos más ricos (VMP, ubicación, recencia).</div>`;
  h += `<div class="kpi-grid">
    ${kpi({label:'Clientes únicos', value:fmt(customers.length), icon:'people', color:'blue'})}
    ${kpi({label:'Recurrentes', value:fmt(recurring.length), sub:`${customers.length?(recurring.length/customers.length*100).toFixed(0):0}% del total`, icon:'trend', color:'green'})}
    ${kpi({label:'Top 10 clientes', value:fmtMoney(top10Rev), sub:`${totalRev?(top10Rev/totalRev*100).toFixed(0):0}% de ingresos`, icon:'coins', color:'amber'})}
    ${kpi({label:'Ticket por cliente', value:fmtMoney(customers.length ? totalRev/customers.length : 0), icon:'scale', color:'purple'})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Top 30 clientes por ingresos</div></div>
    <div style="max-height:520px;overflow:auto"><table>
      <thead><tr><th>#</th><th>Cliente</th><th>Email</th><th class="r">Pedidos</th><th class="r">Unidades</th><th class="r">Total</th></tr></thead>
      <tbody>
      ${customers.slice(0,30).map((c,i)=>`<tr>
        <td style="color:#94A3B8">${i+1}</td>
        <td>${escapeHtml(truncate(c.name.trim() || '—', 30))}</td>
        <td style="font-size:11px;color:#64748B">${escapeHtml(truncate(c.email || '—', 36))}</td>
        <td class="r">${c.orderCount}</td>
        <td class="r">${fmt(c.items)}</td>
        <td class="r" style="font-weight:600">${fmtMoney(c.revenue)}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
  return h;
}

function viewGeografia(){
  if(!state.customersStats) return '<div class="empty">Sube el CSV de Clientes para ver análisis geográfico.</div>';
  const s = state.customersStats;
  const topCities = s.byCity.slice(0, 15);
  const topRegions = s.byRegion.slice(0, 10);
  let h = `<div class="kpi-grid-3">
    ${kpi({label:'Distritos / localidades', value:fmt(s.byCity.length), sub:'con al menos 1 cliente activo', icon:'pin', color:'blue'})}
    ${kpi({label:'Regiones', value:fmt(s.byRegion.length), icon:'pin', color:'green'})}
    ${kpi({label:'Top distrito', value:topCities[0] ? escapeHtml(topCities[0].key) : '—', sub:topCities[0] ? fmtMoney(topCities[0].revenue) : '', icon:'star', color:'amber'})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Top 15 distritos por ingresos</div><div class="panel-sub">Usa la columna "Código postal" cuando "Ciudad" viene vacía (quirk de WooCommerce Perú)</div></div></div>
    ${hBar(topCities.map(c=>({label:c.key, value:c.revenue})), {color:COLORS.blue, valueFormatter:fmtMoney, maxRows:15})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Distritos por nº de clientes</div></div>
    ${hBar([...s.byCity].sort((a,b)=>b.customers-a.customers).slice(0,15).map(c=>({label:c.key, value:c.customers})), {color:COLORS.green, valueFormatter:fmt, maxRows:15})}
  </div>`;
  if(topRegions.length > 1){
    h += `<div class="panel">
      <div class="panel-head"><div class="panel-title">Regiones por ingresos</div></div>
      ${hBar(topRegions.map(r=>({label:r.key, value:r.revenue})), {color:COLORS.amber, valueFormatter:fmtMoney, maxRows:10})}
    </div>`;
  }
  h += `<div class="panel">
    <div class="panel-head"><div class="panel-title">Tabla completa</div></div>
    <div style="max-height:460px;overflow:auto"><table>
      <thead><tr><th>Distrito / Localidad</th><th class="r">Clientes</th><th class="r">Pedidos</th><th class="r">Ingresos</th><th class="r">Tkt medio</th></tr></thead>
      <tbody>
      ${s.byCity.map(c=>`<tr>
        <td>${escapeHtml(c.key)}</td>
        <td class="r">${fmt(c.customers)}</td>
        <td class="r">${fmt(c.orders)}</td>
        <td class="r" style="font-weight:600">${fmtMoney(c.revenue)}</td>
        <td class="r">${fmtMoney(c.orders ? c.revenue/c.orders : 0)}</td>
      </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
  return h;
}

function viewRecencia(){
  if(!state.customersStats) return '<div class="empty">Sube el CSV de Clientes para ver análisis de recencia.</div>';
  const s = state.customersStats;
  const r = s.recencyBuckets;
  const activePct = s.total ? ((r['0–7d']+r['8–30d'])/s.total*100).toFixed(0) : 0;
  const inactivePct = s.total ? ((r['91–180d']+r['181d+'])/s.total*100).toFixed(0) : 0;
  let h = `<div class="kpi-grid">
    ${kpi({label:'Activos (≤30 días)', value:fmt(r['0–7d']+r['8–30d']), sub:`${activePct}% del total`, icon:'trend', color:'green'})}
    ${kpi({label:'Tibios (31–90 días)', value:fmt(r['31–90d']), sub:'mandar campaña de retorno', icon:'calendar', color:'amber'})}
    ${kpi({label:'Inactivos (>90 días)', value:fmt(r['91–180d']+r['181d+']), sub:`${inactivePct}% del total`, icon:'alert', color:'red'})}
    ${kpi({label:'En riesgo', value:fmt(s.atRisk.length), sub:'2+ pedidos, inactivos >90d', icon:'alert', color:'purple'})}
  </div>`;
  h += `<div class="panel">
    <div class="panel-head"><div><div class="panel-title">Recencia — días desde última actividad</div><div class="panel-sub">Buckets de tiempo desde la última sesión del cliente</div></div></div>
    ${vBar(Object.entries(r).map(([k,v])=>({label:k, value:v, color: k==='0–7d'||k==='8–30d'?'#059669' : k==='31–90d'?'#D97706' : k==='nunca'?'#64748B':'#DC2626'})), {color:COLORS.blue})}
  </div>`;
  if(s.atRisk.length){
    h += `<div class="panel">
      <div class="panel-head"><div class="panel-title">Top 30 clientes en riesgo</div><div class="panel-meta">${s.atRisk.length} totales</div></div>
      <div style="max-height:440px;overflow:auto"><table>
        <thead><tr><th>Cliente</th><th>Email</th><th class="r">Pedidos</th><th class="r">Gasto total</th><th>Última actividad</th></tr></thead>
        <tbody>
        ${[...s.atRisk].sort((a,b)=>b.totalSpend-a.totalSpend).slice(0,30).map(c=>`<tr>
          <td>${escapeHtml(truncate(c.name||'—', 28))}</td>
          <td style="font-size:11px;color:#64748B">${escapeHtml(truncate(c.email||'—', 32))}</td>
          <td class="r">${c.orders}</td>
          <td class="r" style="font-weight:600">${fmtMoney(c.totalSpend)}</td>
          <td style="font-size:11px;color:#64748B">${escapeHtml((c.lastActivity||'').slice(0,10))}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  }
  h += `<div class="insight info"><b>Playbook:</b> envía campañas diferenciadas por bucket. <b>0–30d</b> → upsell / recomendaciones. <b>31–90d</b> → recordatorio con beneficio suave. <b>91–180d</b> → cupón de reactivación (15%). <b>181d+</b> → win-back con descuento agresivo.</div>`;
  return h;
}

// ===== Benchmark view =====
function viewBenchmark(){
  const consent = getConsent();
  if(!consent || consent.decision !== 'accepted'){
    return '<div class="empty">Primero activa el consentimiento para acceder al benchmark.</div>';
  }
  const industry = consent.industry || 'otros';
  const industryLabel = (INDUSTRIES.find(i=>i.id===industry)||{}).label || industry;
  // Intenta fetch real; si falla o no hay endpoint, usa mock.
  const bench = MOCK_BENCHMARKS[industry] || MOCK_BENCHMARKS._default;
  const isMock = !CONFIG.studyFetchEndpoint;

  const payload = buildContributionPayload(industry, consent.sizeBucket || 'micro');
  const yourAvgTicket   = payload.orders    ? payload.orders.avgTicket             : null;
  const yourRecurring   = payload.customers ? payload.customers.recurringPctOfActive: null;
  const yourPareto      = payload.products  ? payload.products.pareto80Pct          : null;
  const yourSingleOrd   = payload.orders    ? payload.orders.singleProductOrdersPct : null;
  const yourTop10Share  = payload.customers ? payload.customers.top10PctShare*100   : null;
  const yourItemsPerOrd = payload.orders    ? payload.orders.avgItemsPerOrder       : null;

  let h = '';
  if(isMock){
    h += `<div class="insight warn"><b>Modo demo:</b> el backend del estudio aún no está conectado, los percentiles que ves son de referencia (mock). Una vez que Lima Retail configure el servidor, los números vendrán de contribuciones reales. Tu contribución anónima ya está encolada y se enviará automáticamente cuando el backend esté listo.</div>`;
  }
  h += `<div class="kpi-grid-3">
    ${kpi({label:'Tu industria', value:escapeHtml(industryLabel), icon:'tag', color:'blue'})}
    ${kpi({label:'Tu tamaño', value:escapeHtml((sizeBucketFromRevenue(payload.products?.totalRevenue || payload.orders?.totalRevenue || 0).label.split('·')[0]||'').trim()), icon:'scale', color:'green'})}
    ${kpi({label:'Muestra del sector', value:fmt(bench.sampleSize), sub:'tiendas comparables', icon:'people', color:'amber'})}
  </div>`;

  h += benchCard('Ticket promedio', yourAvgTicket, bench.avgTicket, fmtMoney, 'Ingresos ÷ pedidos. Mayor = menos pedidos pero más rentables por transacción.');
  h += benchCard('Items promedio por pedido', yourItemsPerOrd, bench.avgItemsPerOrder, v=>fmt(v,2), 'Cuántas líneas por pedido. >2 indica cross-sell efectivo.');
  h += benchCard('% pedidos mono-producto', yourSingleOrd, bench.singleProductOrdersPct, v=>fmt(v,0)+'%', '% de pedidos con 1 solo producto. Menos = mejor cross-sell.', true);
  h += benchCard('% clientes recurrentes', yourRecurring, bench.recurringPctOfActive, v=>fmt(v,0)+'%', 'De los clientes activos, cuántos vuelven. Mayor = mejor retención.');
  h += benchCard('Concentración top 10% (share ingresos)', yourTop10Share, {p25:bench.top10PctShare.p25*100,p50:bench.top10PctShare.p50*100,p75:bench.top10PctShare.p75*100,p90:bench.top10PctShare.p90*100}, v=>fmt(v,0)+'%', 'Qué % de ingresos genera el 10% superior de clientes. Muy alto = riesgo de concentración.', true);
  h += benchCard('Concentración Pareto (productos)', yourPareto, bench.pareto80Pct, v=>fmt(v,0)+'%', '% de productos que genera el 80% de ingresos. Menor = más dependiente de pocos productos.', true);

  h += `<div class="insight info"><b>Cómo leerlo:</b> la barra muestra el rango P25–P90 del sector. La <b>línea roja</b> es tu posición. En "menor-es-mejor" (mono-producto, concentración, Pareto) estar a la izquierda es bueno.</div>`;
  return h;
}

function benchCard(title, yourValue, band, formatter, desc, lowerIsBetter){
  if(yourValue == null || yourValue === undefined){
    return `<div class="bench-card"><div class="bench-head"><div class="bench-title">${escapeHtml(title)}</div><div style="color:#94A3B8;font-size:11px">Sin datos para comparar</div></div><div class="bench-comparison">${escapeHtml(desc)}</div></div>`;
  }
  const p25 = band.p25, p90 = band.p90;
  const pos = Math.max(0, Math.min(1, (yourValue - p25) / (p90 - p25)));
  const leftPct = (pos * 100).toFixed(1);
  // Percentile approx
  let percentile = '50';
  if(yourValue <= band.p25) percentile = '≤25';
  else if(yourValue <= band.p50) percentile = '25–50';
  else if(yourValue <= band.p75) percentile = '50–75';
  else if(yourValue <= band.p90) percentile = '75–90';
  else percentile = '>90';

  let verdict = '';
  const betterSide = lowerIsBetter ? (yourValue <= band.p50) : (yourValue >= band.p50);
  if(betterSide) verdict = `<span style="color:#059669;font-weight:600">Mejor que la mediana del sector.</span>`;
  else verdict = `<span style="color:#D97706;font-weight:600">Por debajo de la mediana. Hay margen.</span>`;

  return `<div class="bench-card">
    <div class="bench-head">
      <div class="bench-title">${escapeHtml(title)}</div>
      <div class="bench-your">${escapeHtml(formatter(yourValue))}</div>
    </div>
    <div class="bench-bar">
      <div class="bench-marker" style="left:${leftPct}%"></div>
    </div>
    <div class="bench-scale">
      <span>P25 ${escapeHtml(formatter(band.p25))}</span>
      <span>P50 ${escapeHtml(formatter(band.p50))}</span>
      <span>P75 ${escapeHtml(formatter(band.p75))}</span>
      <span>P90 ${escapeHtml(formatter(band.p90))}</span>
    </div>
    <div class="bench-comparison">Estás en percentil <b>${percentile}</b>. ${verdict} <span style="color:#94A3B8">· ${escapeHtml(desc)}</span></div>
  </div>`;
}

// ===== Iframe host integration =====
// If embedded (different origin or window.parent !== window), post height to parent
// so the host page can size the iframe dynamically. Host should listen:
//   window.addEventListener('message', e => { if(e.data && e.data.type === 'wc-analyzer-height') iframe.style.height = e.data.height + 'px' })
function postHeightToParent(){
  if(window.parent === window) return;
  try {
    const h = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    window.parent.postMessage({ type: 'wc-analyzer-height', height: h }, '*');
  } catch(e){ /* cross-origin restrictions — silent */ }
}
const _origRender = render;
render = function(){
  _origRender();
  setTimeout(postHeightToParent, 50);
  // Si hay datos cargados y no hay decisión de consentimiento, muestra modal.
  if(hasAnyData() && !getConsent() && !_modalEl){
    setTimeout(showConsentModal, 400);
  }
};
window.addEventListener('resize', postHeightToParent);

// boot — restore prior session if any
restoreState();
render();
if(hasAnyData()){
  const files = [state.productsFile, state.ordersFile, state.customersFile].filter(Boolean).map(f => f.name);
  showToast('Datos restaurados: ' + files.join(' · '), 'ok');
}
})();
