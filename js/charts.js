// Inline SVG chart renderers. No external deps.
(function(global){

const COLORS = {
  blue:'#2563EB', red:'#DC2626', green:'#059669', amber:'#D97706',
  gray:'#64748B', lightBlue:'#DBEAFE', lightGreen:'#D1FAE5', lightAmber:'#FEF3C7'
};
const PALETTE = ['#2563EB','#059669','#D97706','#DC2626','#7C3AED','#0891B2','#DB2777','#65A30D'];

function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function fmt(n, d=0){ if(!isFinite(n)) return '—'; return n.toLocaleString('es-ES', {maximumFractionDigits:d, minimumFractionDigits:d}); }
function fmtMoney(n){ return 'S/ ' + fmt(n, 2); }
function fmtShort(n){
  if(n >= 1e6) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
  if(n >= 1e3) return (n/1e3).toFixed(1).replace(/\.0$/,'') + 'k';
  return fmt(n);
}

function truncate(s, n){
  s = String(s||'');
  if(s.length <= n) return s;
  return s.slice(0, n-1) + '…';
}

// Horizontal bar chart.
// items: [{label, value, subValue?}] (already sorted)
function hBar(items, opts={}){
  const {color=COLORS.blue, valueFormatter=fmt, width=780, rowH=22, pad=6, maxRows=10, labelWidth=230} = opts;
  const rows = items.slice(0, maxRows);
  if(!rows.length) return '<div class="empty">Sin datos</div>';
  const max = Math.max(...rows.map(r=>r.value), 1);
  const chartW = width - labelWidth - 90;
  const h = rows.length * rowH + pad*2;
  let svg = `<svg class="chart-svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">`;
  rows.forEach((r, i) => {
    const y = pad + i * rowH;
    const w = Math.max(2, (r.value / max) * chartW);
    svg += `<text x="0" y="${y + rowH/2 + 4}" font-size="12" fill="#334155">${escapeHtml(truncate(r.label, 32))}</text>`;
    svg += `<rect x="${labelWidth}" y="${y+3}" width="${w}" height="${rowH-6}" rx="3" fill="${color}" opacity="0.9"/>`;
    svg += `<text x="${labelWidth + w + 6}" y="${y + rowH/2 + 4}" font-size="11" fill="#475569" font-weight="500">${escapeHtml(valueFormatter(r.value))}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

// Vertical bar chart
function vBar(items, opts={}){
  const {color=COLORS.blue, valueFormatter=fmt, width=780, height=240, showValues=true, labelRotate=false} = opts;
  if(!items.length) return '<div class="empty">Sin datos</div>';
  const max = Math.max(...items.map(r=>r.value), 1);
  const padL = 44, padR = 16, padT = 22, padB = labelRotate ? 60 : 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const bw = chartW / items.length;
  let svg = `<svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  for(let i=0;i<=4;i++){
    const y = padT + chartH - (chartH * i/4);
    svg += `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="#F1F5F9" stroke-width="1"/>`;
    svg += `<text x="${padL-6}" y="${y+3}" font-size="11" fill="#94A3B8" text-anchor="end">${fmtShort(max * i/4)}</text>`;
  }
  items.forEach((r,i) => {
    const x = padL + i*bw + bw*0.15;
    const w = bw * 0.7;
    const h = (r.value / max) * chartH;
    const y = padT + chartH - h;
    const c = r.color || color;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" opacity="0.9" rx="3"/>`;
    if(showValues){
      svg += `<text x="${x + w/2}" y="${y - 5}" font-size="11" fill="#475569" text-anchor="middle" font-weight="500">${escapeHtml(valueFormatter(r.value))}</text>`;
    }
    const lblY = padT + chartH + 18;
    if(labelRotate){
      svg += `<text x="${x + w/2}" y="${lblY}" font-size="11" fill="#64748B" text-anchor="end" transform="rotate(-35 ${x+w/2} ${lblY})">${escapeHtml(truncate(r.label, 14))}</text>`;
    } else {
      svg += `<text x="${x + w/2}" y="${lblY}" font-size="11" fill="#64748B" text-anchor="middle">${escapeHtml(truncate(r.label, 12))}</text>`;
    }
  });
  svg += '</svg>';
  return svg;
}

// Line chart: items [{x:Date|string, y:number}]
function lineChart(items, opts={}){
  const {color=COLORS.blue, width=780, height=240, valueFormatter=fmt, fill=true} = opts;
  if(items.length === 0) return '<div class="empty">Sin datos</div>';
  if(items.length === 1){
    return `<div class="empty">Solo 1 punto de datos (${escapeHtml(items[0].x)} · ${escapeHtml(valueFormatter(items[0].y))})</div>`;
  }
  const padL = 50, padR = 16, padT = 16, padB = 32;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;
  const max = Math.max(...items.map(r=>r.y), 1);
  const min = Math.min(...items.map(r=>r.y), 0);
  const range = max - min || 1;
  let svg = `<svg class="chart-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  for(let i=0;i<=4;i++){
    const y = padT + chartH - (chartH * i/4);
    svg += `<line x1="${padL}" y1="${y}" x2="${width-padR}" y2="${y}" stroke="#F1F5F9" stroke-width="1"/>`;
    const v = min + range * i/4;
    svg += `<text x="${padL-6}" y="${y+3}" font-size="11" fill="#94A3B8" text-anchor="end">${fmtShort(v)}</text>`;
  }
  const stepX = chartW / (items.length - 1);
  const pts = items.map((r,i)=>[padL + i*stepX, padT + chartH - ((r.y - min)/range)*chartH]);
  const path = pts.map((p,i)=>(i===0?'M':'L')+p[0]+','+p[1]).join(' ');
  if(fill){
    const areaPath = path + ` L ${pts[pts.length-1][0]},${padT+chartH} L ${pts[0][0]},${padT+chartH} Z`;
    svg += `<path d="${areaPath}" fill="${color}" opacity="0.12"/>`;
  }
  svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  pts.forEach((p)=>{
    svg += `<circle cx="${p[0]}" cy="${p[1]}" r="2.8" fill="${color}"/>`;
  });
  const lblEvery = Math.max(1, Math.floor(items.length / 8));
  items.forEach((r,i)=>{
    if(i % lblEvery !== 0 && i !== items.length - 1) return;
    const x = padL + i*stepX;
    svg += `<text x="${x}" y="${height-8}" font-size="11" fill="#64748B" text-anchor="middle">${escapeHtml(String(r.x))}</text>`;
  });
  svg += '</svg>';
  return svg;
}

// Donut
function donut(items, opts={}){
  const {width=220, inner=62, outer=95} = opts;
  if(!items.length) return '<div class="empty">Sin datos</div>';
  const total = items.reduce((a,r)=>a+r.value, 0) || 1;
  const cx = width/2, cy = width/2;
  let acc = 0;
  let paths = '';
  let legend = '<div class="legend">';
  items.forEach((r, i) => {
    const start = acc/total * 2*Math.PI - Math.PI/2;
    acc += r.value;
    const end = acc/total * 2*Math.PI - Math.PI/2;
    const large = end - start > Math.PI ? 1 : 0;
    const color = r.color || PALETTE[i % PALETTE.length];
    const x1 = cx + outer*Math.cos(start), y1 = cy + outer*Math.sin(start);
    const x2 = cx + outer*Math.cos(end),   y2 = cy + outer*Math.sin(end);
    const x3 = cx + inner*Math.cos(end),   y3 = cy + inner*Math.sin(end);
    const x4 = cx + inner*Math.cos(start), y4 = cy + inner*Math.sin(start);
    paths += `<path d="M ${x1} ${y1} A ${outer} ${outer} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z" fill="${color}" opacity="0.9"/>`;
    const pct = (r.value/total*100).toFixed(1);
    legend += `<span><span class="dot" style="background:${color}"></span>${escapeHtml(r.label)} · ${pct}%</span>`;
  });
  legend += '</div>';
  return `<svg class="chart-svg chart-svg-center" width="${width}" height="${width}" viewBox="0 0 ${width} ${width}">${paths}</svg>${legend}`;
}

// Year heatmap calendar (GitHub-style). byDay: [{date:'YYYY-MM-DD', orders, revenue}].
// opts: { year, metric: 'orders'|'revenue', cellSize, gap }
function yearCalendar(byDay, opts={}){
  const { metric='orders', cellSize=13, gap=2 } = opts;
  const dates = byDay.map(d => d.date).filter(Boolean).sort();
  if(!dates.length) return '<div class="empty">Sin datos con fecha</div>';
  const defaultYear = parseInt(dates[dates.length-1].slice(0,4));
  const year = opts.year || defaultYear;

  const dataMap = new Map(byDay.filter(d => d.date.startsWith(String(year))).map(d => [d.date, d]));
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const startDow = (start.getDay() + 6) % 7; // 0 = Monday
  const totalDays = Math.round((end - start) / 86400000) + 1;
  const weeks = Math.ceil((totalDays + startDow) / 7);

  const vals = [...dataMap.values()].map(d => metric === 'revenue' ? d.revenue : d.orders);
  const max = Math.max(...vals, 1);

  const padL = 24, padT = 16, padR = 8, padB = 6;
  const width = padL + weeks * (cellSize + gap) + padR;
  const height = padT + 7 * (cellSize + gap) + padB;

  const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const dowLabels = ['L','','M','','V','',''];

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="chart-svg">`;
  const monthShown = new Set();

  for(let w = 0; w < weeks; w++){
    for(let d = 0; d < 7; d++){
      const offset = w*7 + d - startDow;
      if(offset < 0 || offset >= totalDays) continue;
      const date = new Date(year, 0, 1 + offset);
      const key = date.toISOString().slice(0,10);
      const data = dataMap.get(key);
      const x = padL + w * (cellSize + gap);
      const y = padT + d * (cellSize + gap);
      let color = '#ececea';
      if(data){
        const v = metric === 'revenue' ? data.revenue : data.orders;
        if(v > 0){
          const intensity = v / max;
          if(intensity < 0.2) color = '#C7DCEF';
          else if(intensity < 0.4) color = '#8EB8DB';
          else if(intensity < 0.65) color = '#4B8AC4';
          else if(intensity < 0.85) color = '#2A6EAF';
          else color = '#185FA5';
        }
      }
      const title = data
        ? `${key} · ${data.orders} pedido(s) · ${fmtMoney(data.revenue)}`
        : `${key} · sin ventas`;
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${color}"><title>${title}</title></rect>`;
      if(d === 0 && date.getDate() <= 7 && !monthShown.has(date.getMonth())){
        monthShown.add(date.getMonth());
        svg += `<text x="${x}" y="${padT - 4}" font-size="9" fill="#888">${monthNames[date.getMonth()]}</text>`;
      }
    }
  }
  [0,2,4].forEach(i => {
    svg += `<text x="${padL - 4}" y="${padT + i*(cellSize+gap) + cellSize - 2}" font-size="9" fill="#aaa" text-anchor="end">${['L','M','V'][i/2]}</text>`;
  });
  svg += '</svg>';

  // legend
  const scale = ['#ececea','#C7DCEF','#8EB8DB','#4B8AC4','#2A6EAF','#185FA5'];
  let legend = '<div class="legend" style="justify-content:flex-end"><span>Menos</span>';
  scale.forEach(c => legend += `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${c}"></span>`);
  legend += '<span>Más</span></div>';
  return svg + legend;
}

global.WCCharts = { hBar, vBar, lineChart, donut, yearCalendar, fmt, fmtMoney, fmtShort, escapeHtml, truncate, PALETTE, COLORS };

})(window);
