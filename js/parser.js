// CSV parser quote-aware. Detects Products vs Orders WooCommerce exports.
(function(global){

function parseCSV(text){
  // RFC4180-ish parser. Handles quoted fields with commas, escaped quotes (""), CR/LF.
  text = text.replace(/^\uFEFF/, ''); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  let i = 0;
  const n = text.length;
  while(i < n){
    const c = text[i];
    if(inQ){
      if(c === '"'){
        if(text[i+1] === '"'){ field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if(c === '"'){ inQ = true; i++; continue; }
    if(c === ','){ row.push(field); field = ''; i++; continue; }
    if(c === '\r'){ i++; continue; }
    if(c === '\n'){ row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    field += c; i++;
  }
  // flush last
  if(field.length > 0 || row.length > 0){ row.push(field); rows.push(row); }
  // drop fully-empty trailing rows
  while(rows.length && rows[rows.length-1].every(v => v === '')) rows.pop();
  return rows;
}

function toNumber(v){
  if(v == null) return 0;
  const s = String(v).trim();
  if(!s || s === 'N/D') return 0;
  // remove thousand sep if looks like "1.234,56" (es) vs "1,234.56" (en)
  // heuristic: if has both . and , → treat last as decimal
  let cleaned = s.replace(/[^\d.,-]/g, '');
  const hasDot = cleaned.includes('.');
  const hasCom = cleaned.includes(',');
  if(hasDot && hasCom){
    if(cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')){
      cleaned = cleaned.replace(/\./g,'').replace(',','.');
    } else {
      cleaned = cleaned.replace(/,/g,'');
    }
  } else if(hasCom){
    // assume comma is decimal only if one comma and 1-2 digits after
    const parts = cleaned.split(',');
    if(parts.length === 2 && parts[1].length <= 2) cleaned = parts[0] + '.' + parts[1];
    else cleaned = cleaned.replace(/,/g,'');
  }
  const x = parseFloat(cleaned);
  return isNaN(x) ? 0 : x;
}

function norm(s){ return String(s || '').trim().toLowerCase(); }

// Parse XLSX arrayBuffer using SheetJS (XLSX global loaded via CDN).
function parseXLSX(arrayBuffer){
  if(typeof XLSX === 'undefined') throw new Error('SheetJS (XLSX) no cargado');
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd hh:mm:ss', defval: '' });
  while(rows.length && rows[rows.length-1].every(v => v === '' || v == null)) rows.pop();
  return rows;
}

// Detect type from header row.
function detectType(header){
  const H = header.map(norm);
  const has = (...needles) => needles.every(nd => H.some(h => h.includes(nd)));
  // Customers export signature: "gasto total" or "vmp" + pedidos
  const hasGastoTotal = H.some(h => /gasto total|total spend/.test(h));
  const hasVMP = H.some(h => h === 'vmp' || /valor medio|aov/.test(h));
  const hasEmail = H.some(h => /correo|email/.test(h));
  const hasOrdersCount = H.some(h => h === 'pedidos' || h === 'orders');
  if((hasGastoTotal && hasOrdersCount) || (hasVMP && hasEmail && hasOrdersCount)) return 'customers';
  // Products
  if(has('título') && (has('ingresos') || has('artículos vendidos'))) return 'products';
  if(H.includes('sku') && (H.includes('categoría') || H.includes('categoria')) && H.some(h=>h.includes('ingresos'))) return 'products';
  // Orders (line items)
  const hasDate = H.some(h => /(fecha|date)/.test(h));
  const hasProduct = H.some(h => /(producto|product|item|artículo|articulo|article)/.test(h));
  const hasOrderIndicator = H.some(h => /(pedido|order|coste|price|total|importe|cliente|customer|correo|email)/.test(h));
  if(hasDate && hasProduct && hasOrderIndicator) return 'orders';
  return 'unknown';
}

function findCol(header, candidates){
  const H = header.map(norm);
  for(const cand of candidates){
    const c = norm(cand);
    const idx = H.findIndex(h => h === c);
    if(idx >= 0) return idx;
  }
  // fuzzy contains
  for(const cand of candidates){
    const c = norm(cand);
    const idx = H.findIndex(h => h.includes(c));
    if(idx >= 0) return idx;
  }
  return -1;
}

function parseProducts(rows){
  const header = rows[0];
  const col = {
    title: findCol(header, ['Título del producto','Título','Titulo','Product name','Name']),
    sku:   findCol(header, ['SKU']),
    sold:  findCol(header, ['Artículos vendidos','Articulos vendidos','Items sold','Units sold']),
    rev:   findCol(header, ['Ingresos netos','Net revenue','Revenue','Ingresos']),
    ord:   findCol(header, ['Pedidos','Orders']),
    cat:   findCol(header, ['Categoría','Categoria','Category']),
    var:   findCol(header, ['Variaciones','Variations']),
    state: findCol(header, ['Estado','Status']),
    stock: findCol(header, ['Inventario','Stock'])
  };
  const out = [];
  for(let i=1;i<rows.length;i++){
    const r = rows[i];
    if(!r || r.every(v => !v)) continue;
    const title = (r[col.title] || '').trim();
    if(!title) continue;
    // skip "borrado"/"sin categorizar"-style rows with >10 categories (these are deletion artifacts)
    const rawCats = (col.cat >= 0 ? r[col.cat] : '') || '';
    const cats = rawCats.split(',').map(s => s.trim()).filter(Boolean);
    const tooManyCats = cats.length > 10;
    out.push({
      title,
      sku: col.sku >= 0 ? (r[col.sku]||'').trim() : '',
      sold: toNumber(r[col.sold]),
      revenue: toNumber(r[col.rev]),
      orders: toNumber(r[col.ord]),
      categories: tooManyCats ? ['(producto borrado)'] : cats,
      variations: toNumber(r[col.var]),
      state: col.state >= 0 ? (r[col.state]||'').trim() : '',
      stock: (r[col.stock] === 'N/D' || r[col.stock] == null) ? null : toNumber(r[col.stock]),
      deleted: /\(borrado\)/i.test(title) || tooManyCats
    });
  }
  return out;
}

function parseOrders(rows){
  const header = rows[0];
  const col = {
    orderId:  findCol(header, ['Order ID','N° pedido','Número de pedido','Numero de pedido','Order #','ID pedido','Order Number','Pedido #','ID','#']),
    date:     findCol(header, ['Fecha del pedido','Fecha de pedido','Fecha','Date','Order date','Fecha de compra']),
    status:   findCol(header, ['Estado','Status','Estado del pedido']),
    product:  findCol(header, ['Nombre del artículo','Nombre del articulo','Nombre del producto','Nombre producto','Producto','Product','Product name','Product Name','Line item name','Item','Artículo','Articulo','Item name','Name']),
    qty:      findCol(header, ['Cantidad','Quantity','Qty','Items sold','Unidades','Cant','Cantidades','Número de unidades']),
    total:    findCol(header, ['Coste de artículo','Coste de articulo','Importe total','Importe','Monto total','Monto','Total línea','Total linea','Line total','Line Total','Net sales','Subtotal','Subtotal del artículo','Coste','Costo','Precio total','Precio','Price','Unit price','Precio unitario','Price per unit','Amount','Valor']),
    customer: findCol(header, ['Correo electrónico (facturación)','Correo electrónico','Email','Customer email','Correo','Cliente','Email del cliente','E-mail','Customer']),
    firstName:findCol(header, ['Nombre (facturación)','Nombre','First name','Customer first name','Billing first name']),
    lastName: findCol(header, ['Apellidos (facturación)','Apellidos','Last name','Customer last name','Billing last name']),
    phone:    findCol(header, ['Teléfono (facturación)','Teléfono','Telefono','Phone','Celular','Mobile']),
    products: findCol(header, ['Productos','Products','Product(s)','Artículos','Line items'])
  };

  // Debug info: expone qué columnas se detectaron para poder diagnosticar problemas
  if(typeof window !== 'undefined'){
    window.__lastOrdersColumns = { header, col, missing: [] };
    if(col.product < 0) window.__lastOrdersColumns.missing.push('producto');
    if(col.total   < 0) window.__lastOrdersColumns.missing.push('precio/total');
    if(col.date    < 0) window.__lastOrdersColumns.missing.push('fecha');
    if(col.qty     < 0) window.__lastOrdersColumns.missing.push('cantidad (se usará 1)');
  }

  const hasOrderId = col.orderId >= 0;
  const hasProduct = col.product >= 0;
  const hasAggregated = col.products >= 0 && col.product < 0;

  const lineItems = [];

  if(!hasOrderId && hasProduct && col.date >= 0){
    // Forward-fill mode: each non-empty date row starts a new order.
    let current = null;
    let seq = 0;
    for(let i=1;i<rows.length;i++){
      const r = rows[i];
      if(!r || r.every(v => v === '' || v == null)) continue;
      const rawDate = (r[col.date] == null ? '' : String(r[col.date])).trim();
      if(rawDate){
        seq++;
        current = {
          orderId: 'O' + String(seq).padStart(5, '0'),
          date: rawDate,
          customer: col.customer >= 0 ? String(r[col.customer]||'').trim() : '',
          firstName: col.firstName >= 0 ? String(r[col.firstName]||'').trim() : '',
          lastName:  col.lastName  >= 0 ? String(r[col.lastName] ||'').trim() : '',
          phone:     col.phone     >= 0 ? String(r[col.phone]    ||'').trim() : '',
          status:    col.status    >= 0 ? String(r[col.status]   ||'').trim() : ''
        };
      }
      if(!current) continue;
      const product = String(r[col.product]||'').trim();
      if(!product) continue;
      lineItems.push({
        orderId: current.orderId,
        date: current.date,
        product,
        qty: col.qty >= 0 ? (toNumber(r[col.qty]) || 1) : 1,
        total: col.total >= 0 ? toNumber(r[col.total]) : 0,
        customer: current.customer,
        firstName: current.firstName,
        lastName: current.lastName,
        phone: current.phone,
        status: current.status
      });
    }
    return { lineItems };
  }

  // Original logic: explicit Order ID (line-item or aggregated)
  const isLineItem = hasOrderId && hasProduct;
  const isAggregated = hasOrderId && hasAggregated;
  for(let i=1;i<rows.length;i++){
    const r = rows[i];
    if(!r || r.every(v => v === '' || v == null)) continue;
    const oid = col.orderId >= 0 ? String(r[col.orderId]||'').trim() : '';
    if(!oid) continue;
    const date = col.date >= 0 ? String(r[col.date]||'').trim() : '';
    const status = col.status >= 0 ? String(r[col.status]||'').trim() : '';
    const customer = col.customer >= 0 ? String(r[col.customer]||'').trim() : '';
    if(isLineItem){
      const prod = String(r[col.product]||'').trim();
      if(!prod) continue;
      lineItems.push({
        orderId: oid, date, product: prod,
        qty: col.qty >= 0 ? toNumber(r[col.qty]) || 1 : 1,
        total: col.total >= 0 ? toNumber(r[col.total]) : 0,
        customer, status
      });
    } else if(isAggregated){
      const joined = String(r[col.products]||'').trim();
      if(!joined) continue;
      const total = col.total >= 0 ? toNumber(r[col.total]) : 0;
      const parts = joined.split(/\s*[|;]\s*|\s*,(?=\s*(?:\d+\s*x|\w))/);
      const n = parts.length;
      for(const p of parts){
        if(!p.trim()) continue;
        const m = p.match(/^\s*(\d+)\s*x\s*(.+)$/i);
        const qty = m ? toNumber(m[1]) : 1;
        const name = m ? m[2].trim() : p.trim();
        lineItems.push({ orderId: oid, date, product: name, qty, total: total/n, customer, status });
      }
    }
  }
  return { lineItems };
}

function parseDate(s){
  if(!s) return null;
  s = s.trim();
  // try ISO first
  let d = new Date(s);
  if(!isNaN(d.getTime())) return d;
  // try DD/MM/YYYY or DD-MM-YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if(m){
    const day=+m[1], mo=+m[2]-1, yr=(+m[3] < 100 ? 2000+(+m[3]) : +m[3]);
    const hh=m[4]?+m[4]:0, mm=m[5]?+m[5]:0, ss=m[6]?+m[6]:0;
    d = new Date(yr, mo, day, hh, mm, ss);
    if(!isNaN(d.getTime())) return d;
  }
  return null;
}

function parseCustomers(rows){
  const header = rows[0];
  const col = {
    name:         findCol(header, ['Nombre','Name','Customer name']),
    username:     findCol(header, ['Nombre de usuario','Username']),
    lastActivity: findCol(header, ['Última actividad','Ultima actividad','Last activity','Last active']),
    register:     findCol(header, ['Registro','Fecha de registro','Register','Registered','Registration date']),
    email:        findCol(header, ['Correo electrónico','Correo electronico','Correo','Email']),
    orders:       findCol(header, ['Pedidos','Orders','Order count']),
    totalSpend:   findCol(header, ['Gasto total','Total spend','Total gastado']),
    vmp:          findCol(header, ['VMP','AOV','Valor medio por pedido','Valor medio']),
    country:      findCol(header, ['País / Región','País','Pais','Country']),
    city:         findCol(header, ['Ciudad','City','Localidad']),
    region:       findCol(header, ['Región','Region','Provincia','State']),
    postal:       findCol(header, ['Código postal','Codigo postal','Postal code','Zip'])
  };
  const out = [];
  for(let i=1;i<rows.length;i++){
    const r = rows[i];
    if(!r || r.every(v => v === '' || v == null)) continue;
    const email = col.email >= 0 ? String(r[col.email]||'').trim() : '';
    const name  = col.name  >= 0 ? String(r[col.name] ||'').trim() : '';
    if(!email && !name) continue;
    out.push({
      name,
      username:     col.username     >= 0 ? String(r[col.username]    ||'').trim() : '',
      lastActivity: col.lastActivity >= 0 ? String(r[col.lastActivity]||'').trim() : '',
      register:     col.register     >= 0 ? String(r[col.register]    ||'').trim() : '',
      email,
      orders:     toNumber(r[col.orders]),
      totalSpend: toNumber(r[col.totalSpend]),
      vmp:        toNumber(r[col.vmp]),
      country: col.country >= 0 ? String(r[col.country]||'').trim() : '',
      city:    col.city    >= 0 ? String(r[col.city]   ||'').trim() : '',
      region:  col.region  >= 0 ? String(r[col.region] ||'').trim() : '',
      postal:  col.postal  >= 0 ? String(r[col.postal] ||'').trim() : ''
    });
  }
  return out;
}

global.WCParser = { parseCSV, parseXLSX, parseProducts, parseOrders, parseCustomers, detectType, toNumber, parseDate };

})(window);
