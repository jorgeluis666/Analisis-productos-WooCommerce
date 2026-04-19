// Analytics computations for Products and Orders data.
(function(global){

// ----- PRODUCTS -----
function analyzeProducts(products){
  const clean = products.filter(p => !p.deleted);
  const totalRevenue = clean.reduce((a,p)=>a+p.revenue,0);
  const totalUnits = clean.reduce((a,p)=>a+p.sold,0);
  const totalOrders = clean.reduce((a,p)=>a+p.orders,0); // overlap-inflated
  const productsWithSales = clean.filter(p => p.sold > 0).length;
  const averagePrice = totalUnits > 0 ? totalRevenue / totalUnits : 0;

  const top = [...clean].sort((a,b)=>b.revenue-a.revenue);

  // Pareto 80/20
  let acc = 0; let pareto80 = 0;
  for(const p of top){
    if(acc/totalRevenue >= 0.8) break;
    acc += p.revenue; pareto80++;
  }

  // By category (split multi-cat contributions evenly)
  const catMap = new Map();
  for(const p of clean){
    const cats = p.categories && p.categories.length ? p.categories : ['(sin categoría)'];
    const weight = 1/cats.length;
    for(const c of cats){
      const cur = catMap.get(c) || {category:c, revenue:0, units:0, orders:0, products:0};
      cur.revenue += p.revenue * weight;
      cur.units += p.sold * weight;
      cur.orders += p.orders * weight;
      cur.products += 1;
      catMap.set(c, cur);
    }
  }
  const byCategory = [...catMap.values()].sort((a,b)=>b.revenue-a.revenue);

  // Inventory signals
  const outOfStock = clean.filter(p => p.state && /sin existencias/i.test(p.state));
  const lowStock = clean.filter(p => p.stock != null && p.stock > 0 && p.stock <= 2);
  const zeroSales = clean.filter(p => p.sold === 0);
  const highPerformers = clean.filter(p => p.sold > 0 && p.variations > 0 && p.revenue / Math.max(1,p.variations) > averagePrice);

  // High units / low revenue (possible underpricing or discounted)
  const avgRevPerUnit = averagePrice;
  const oddRatios = clean
    .filter(p => p.sold > 0 && p.revenue > 0)
    .map(p => ({...p, pricePerUnit: p.revenue / p.sold}))
    .sort((a,b) => a.pricePerUnit - b.pricePerUnit);

  const deleted = products.filter(p => p.deleted);

  return {
    totals: { totalRevenue, totalUnits, totalOrders, productsWithSales, averagePrice, totalProducts: clean.length, deleted: deleted.length },
    top, byCategory, outOfStock, lowStock, zeroSales, oddRatios, pareto80, deleted
  };
}

// Bundle ideas from products data (co-occurrence by shared category)
function productBundleIdeas(products){
  const clean = products.filter(p => !p.deleted && p.sold > 0);
  // For each category, pair top 2 performers
  const catMap = new Map();
  for(const p of clean){
    for(const c of p.categories){
      if(!catMap.has(c)) catMap.set(c, []);
      catMap.get(c).push(p);
    }
  }
  // Ignore too-broad categories
  const broad = new Set(['Bebé','Niña','Niño','Ropa','Sale','Verano','Invierno','Martín Aranda','Royal Baby','Dorian Gray','Benedetta','Colecciones','Regalos','Accesorios','Complementos']);
  const bundles = [];
  for(const [cat, list] of catMap){
    if(list.length < 2) continue;
    if(broad.has(cat) && list.length > 8) continue; // too generic
    const top = list.sort((a,b)=>b.sold-a.sold).slice(0,3);
    if(top.length < 2) continue;
    const score = top.reduce((a,p)=>a+p.sold,0);
    bundles.push({
      title: `Bundle "${cat}"`,
      items: top.map(p => p.title),
      note: `Categoría con ${list.length} productos activos. Los 3 más vendidos acumulan ${score} unidades.`,
      score,
      category: cat
    });
  }
  return bundles.sort((a,b)=>b.score-a.score).slice(0, 12);
}

// ----- ORDERS -----
function analyzeOrders(lineItems){
  // Group by orderId
  const orderMap = new Map();
  for(const li of lineItems){
    if(!orderMap.has(li.orderId)) orderMap.set(li.orderId, { orderId: li.orderId, date: li.date, items: [], total: 0, distinctProducts: new Set() });
    const o = orderMap.get(li.orderId);
    o.items.push(li);
    o.total += li.total;
    o.distinctProducts.add(li.product);
  }
  const orders = [...orderMap.values()].map(o => ({
    ...o,
    distinctCount: o.distinctProducts.size,
    totalUnits: o.items.reduce((a,i)=>a+i.qty, 0),
    parsedDate: WCParser.parseDate(o.date)
  }));

  // Ticket
  const totalRevenue = orders.reduce((a,o)=>a+o.total,0);
  const totalOrders = orders.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const avgItemsPerOrder = totalOrders > 0 ? orders.reduce((a,o)=>a+o.totalUnits,0) / totalOrders : 0;
  const avgDistinctPerOrder = totalOrders > 0 ? orders.reduce((a,o)=>a+o.distinctCount,0) / totalOrders : 0;

  // Distribution of orders by # distinct products
  const distBuckets = {'1':0,'2':0,'3':0,'4':0,'5+':0};
  const distRev = {'1':0,'2':0,'3':0,'4':0,'5+':0};
  for(const o of orders){
    const key = o.distinctCount >= 5 ? '5+' : String(o.distinctCount);
    distBuckets[key] = (distBuckets[key]||0) + 1;
    distRev[key] = (distRev[key]||0) + o.total;
  }

  // Ticket by # items
  const ticketBySize = Object.keys(distBuckets).map(k => ({
    size: k,
    orders: distBuckets[k],
    avgTicket: distBuckets[k] ? distRev[k]/distBuckets[k] : 0,
    revenue: distRev[k]
  }));

  // Top products (by qty & revenue)
  const pMap = new Map();
  for(const li of lineItems){
    if(!pMap.has(li.product)) pMap.set(li.product, { product: li.product, qty:0, revenue:0, orders:new Set() });
    const p = pMap.get(li.product);
    p.qty += li.qty;
    p.revenue += li.total;
    p.orders.add(li.orderId);
  }
  const topProducts = [...pMap.values()].map(p => ({...p, orderCount:p.orders.size, orders:undefined}))
    .sort((a,b)=>b.revenue-a.revenue);

  // Market Basket: pairs co-occurring in same order (distinct products only)
  const pairMap = new Map();
  const productOrderCount = new Map();
  for(const o of orders){
    const uniq = [...o.distinctProducts];
    for(const p of uniq) productOrderCount.set(p, (productOrderCount.get(p)||0)+1);
    for(let i=0;i<uniq.length;i++){
      for(let j=i+1;j<uniq.length;j++){
        const key = [uniq[i], uniq[j]].sort().join('||');
        pairMap.set(key, (pairMap.get(key)||0)+1);
      }
    }
  }
  const pairs = [...pairMap.entries()].map(([k,count]) => {
    const [a,b] = k.split('||');
    const supportA = productOrderCount.get(a) || 1;
    const supportB = productOrderCount.get(b) || 1;
    const confAB = count / supportA;
    const confBA = count / supportB;
    // Lift: P(B|A)/P(B) = count*N / (supportA * supportB)
    const lift = (count * totalOrders) / (supportA * supportB);
    return { a, b, count, lift, confidence: Math.max(confAB, confBA) };
  }).sort((a,b)=>{
    if(b.count !== a.count) return b.count - a.count;
    return b.lift - a.lift;
  });

  // Temporal: by day
  const dayMap = new Map();
  const monthMap = new Map();
  const dowMap = Array(7).fill(null).map(()=>({dow:0, orders:0, revenue:0}));
  const dowNames = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let minDate = null, maxDate = null;
  for(const o of orders){
    const d = o.parsedDate;
    if(!d) continue;
    if(!minDate || d < minDate) minDate = d;
    if(!maxDate || d > maxDate) maxDate = d;
    const dk = d.toISOString().slice(0,10);
    const mk = dk.slice(0,7);
    if(!dayMap.has(dk)) dayMap.set(dk, {date:dk, orders:0, revenue:0, units:0});
    const dd = dayMap.get(dk);
    dd.orders++; dd.revenue += o.total; dd.units += o.totalUnits;
    if(!monthMap.has(mk)) monthMap.set(mk, {month:mk, orders:0, revenue:0, units:0});
    const mm = monthMap.get(mk);
    mm.orders++; mm.revenue += o.total; mm.units += o.totalUnits;
    const dw = d.getDay();
    dowMap[dw].dow = dw;
    dowMap[dw].orders++;
    dowMap[dw].revenue += o.total;
  }
  const byDay = [...dayMap.values()].sort((a,b)=>a.date.localeCompare(b.date));
  const byMonth = [...monthMap.values()].sort((a,b)=>a.month.localeCompare(b.month));
  const byDow = dowMap.map((d,i)=>({...d, name:dowNames[i]}));

  return {
    orders,
    totals: { totalRevenue, totalOrders, avgTicket, avgItemsPerOrder, avgDistinctPerOrder,
              uniqueProducts: pMap.size, lineItems: lineItems.length,
              dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null },
    distBuckets, distRev, ticketBySize,
    topProducts,
    pairs,
    byDay, byMonth, byDow
  };
}

// Bundle ideas from actual co-purchase
function orderBundleIdeas(pairs, topProducts){
  // Filter to pairs with count >= 2 AND lift >= 1.2
  return pairs.filter(p => p.count >= 2 && p.lift >= 1.2).slice(0, 15)
    .map(p => ({
      title: 'Co-purchase detectado',
      items: [p.a, p.b],
      note: `Juntos en ${p.count} pedidos · lift ${p.lift.toFixed(2)}x · confianza ${(p.confidence*100).toFixed(0)}%`,
      score: p.count * p.lift,
      meta: p
    }));
}

// Top products per month. Returns [{month:'YYYY-MM', orders, units, revenue, topByRevenue:[], topByUnits:[]}]
function monthlyTopProducts(lineItems, topN=5){
  const months = new Map();
  for(const li of lineItems){
    const d = WCParser.parseDate(li.date);
    if(!d) continue;
    const mk = d.toISOString().slice(0,7);
    if(!months.has(mk)){
      months.set(mk, { month: mk, orders: new Set(), revenue: 0, units: 0, products: new Map() });
    }
    const m = months.get(mk);
    m.orders.add(li.orderId);
    m.revenue += li.total;
    m.units += li.qty;
    if(!m.products.has(li.product)){
      m.products.set(li.product, { product: li.product, qty: 0, revenue: 0, orders: new Set() });
    }
    const p = m.products.get(li.product);
    p.qty += li.qty;
    p.revenue += li.total;
    p.orders.add(li.orderId);
  }
  return [...months.values()].map(m => ({
    month: m.month,
    orders: m.orders.size,
    revenue: m.revenue,
    units: m.units,
    topByRevenue: [...m.products.values()]
      .sort((a,b) => b.revenue - a.revenue)
      .slice(0, topN)
      .map(p => ({ product: p.product, qty: p.qty, revenue: p.revenue, orders: p.orders.size })),
    topByUnits: [...m.products.values()]
      .sort((a,b) => b.qty - a.qty)
      .slice(0, topN)
      .map(p => ({ product: p.product, qty: p.qty, revenue: p.revenue, orders: p.orders.size }))
  })).sort((a,b) => a.month.localeCompare(b.month));
}

function analyzeCustomers(customers){
  const total = customers.length;
  const active = customers.filter(c => c.orders > 0);
  const inactive = customers.filter(c => c.orders === 0);
  const recurring = customers.filter(c => c.orders >= 2);
  const vips = customers.filter(c => c.orders >= 5);
  const totalSpend = customers.reduce((a,c)=>a+c.totalSpend, 0);
  const avgSpend = active.length ? totalSpend / active.length : 0;
  const avgVMP = active.length ? active.reduce((a,c)=>a+c.vmp, 0) / active.length : 0;

  const topByRevenue = [...active].sort((a,b)=>b.totalSpend-a.totalSpend);
  const topByOrders  = [...active].sort((a,b)=>b.orders-a.orders);

  // WooCommerce Peru quirk: the "Ciudad" field is often empty and the real
  // district (SANISIDRO, MIRAFLORES, ATE...) is stored in "Código postal".
  // Use city if present, else postal as the effective locality.
  const cityMap = new Map();
  const regionMap = new Map();
  for(const c of active){
    const loc = (c.city && c.city.trim()) || (c.postal && c.postal.trim());
    if(loc){
      const cur = cityMap.get(loc) || {key:loc, customers:0, revenue:0, orders:0};
      cur.customers++; cur.revenue += c.totalSpend; cur.orders += c.orders;
      cityMap.set(loc, cur);
    }
    if(c.region){
      const cur = regionMap.get(c.region) || {key:c.region, customers:0, revenue:0, orders:0};
      cur.customers++; cur.revenue += c.totalSpend; cur.orders += c.orders;
      regionMap.set(c.region, cur);
    }
  }
  const byCity = [...cityMap.values()].sort((a,b)=>b.revenue-a.revenue);
  const byRegion = [...regionMap.values()].sort((a,b)=>b.revenue-a.revenue);

  const now = new Date();
  const recencyBuckets = {'0–7d':0,'8–30d':0,'31–90d':0,'91–180d':0,'181d+':0,'nunca':0};
  for(const c of customers){
    if(!c.lastActivity){ recencyBuckets['nunca']++; continue; }
    const d = new Date(c.lastActivity);
    if(isNaN(d.getTime())){ recencyBuckets['nunca']++; continue; }
    const days = Math.floor((now - d) / 86400000);
    if(days <= 7)       recencyBuckets['0–7d']++;
    else if(days <= 30) recencyBuckets['8–30d']++;
    else if(days <= 90) recencyBuckets['31–90d']++;
    else if(days <= 180)recencyBuckets['91–180d']++;
    else                recencyBuckets['181d+']++;
  }

  const vmpBuckets = {'0':0,'1–50':0,'51–100':0,'101–200':0,'201–500':0,'500+':0};
  for(const c of active){
    const v = c.vmp;
    if(v <= 0) vmpBuckets['0']++;
    else if(v <= 50) vmpBuckets['1–50']++;
    else if(v <= 100) vmpBuckets['51–100']++;
    else if(v <= 200) vmpBuckets['101–200']++;
    else if(v <= 500) vmpBuckets['201–500']++;
    else vmpBuckets['500+']++;
  }

  const orderBuckets = {'1':0,'2':0,'3':0,'4–5':0,'6–10':0,'11+':0};
  for(const c of active){
    const o = c.orders;
    if(o === 1) orderBuckets['1']++;
    else if(o === 2) orderBuckets['2']++;
    else if(o === 3) orderBuckets['3']++;
    else if(o <= 5) orderBuckets['4–5']++;
    else if(o <= 10) orderBuckets['6–10']++;
    else orderBuckets['11+']++;
  }

  // At-risk: 90+ days inactive but 2+ orders historically
  const atRisk = customers.filter(c => {
    if(c.orders < 2) return false;
    if(!c.lastActivity) return false;
    const d = new Date(c.lastActivity);
    if(isNaN(d.getTime())) return false;
    const days = (now - d) / 86400000;
    return days > 90;
  });

  // Concentration: top 10% share of revenue
  const sorted = [...customers].sort((a,b)=>b.totalSpend-a.totalSpend);
  const top10pctCount = Math.max(1, Math.ceil(sorted.length * 0.1));
  const top10pctRevenue = sorted.slice(0, top10pctCount).reduce((a,c)=>a+c.totalSpend, 0);
  const top10pctShare = totalSpend ? top10pctRevenue / totalSpend : 0;

  return {
    total, active, inactive, recurring, vips,
    totalSpend, avgSpend, avgVMP,
    topByRevenue, topByOrders,
    byCity, byRegion,
    recencyBuckets, vmpBuckets, orderBuckets,
    atRisk, top10pctShare, top10pctCount, top10pctRevenue
  };
}

global.WCAnalyzer = { analyzeProducts, productBundleIdeas, analyzeOrders, orderBundleIdeas, monthlyTopProducts, analyzeCustomers };

})(window);
