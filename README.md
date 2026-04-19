# WooCommerce Sales Analyzer

Herramienta de análisis de e-commerce para tiendas WooCommerce. **100% en el navegador** — los datos nunca salen del cliente (excepto métricas agregadas y anónimas si el usuario acepta contribuir al estudio sectorial).

Desarrollada por [Lima Retail](https://limaretail.com).

## Qué hace

Acepta tres tipos de exports de WooCommerce y los combina en un dashboard unificado:

| Tipo | Origen | Formato | Habilita |
|---|---|---|---|
| **Productos** | Analíticas → Productos | CSV | Top productos, Pareto, Categorías, Distribución, Inventario |
| **Pedidos** | Analíticas → Pedidos / plugin de exportación | CSV o XLSX | Temporal, Co-compra (basket), Ticket promedio |
| **Clientes** | Analíticas → Clientes | CSV | Geografía, Recencia, VIPs, Clientes en riesgo |

También acepta URLs públicas de Google Sheets. Múltiples archivos a la vez (drag-drop de varios). Persistencia local — al recargar, los datos siguen cargados.

## Estructura

```
index.html              — entry point
css/styles.css          — diseño (estilo Lima Retail)
js/parser.js            — CSV/XLSX parser + detección automática de tipo
js/analyzer.js          — cálculos (Pareto, basket, recencia, etc.)
js/charts.js            — SVG inline (barras, líneas, donut, calendario heatmap)
js/app.js               — UI, estado, persistencia, consentimiento, benchmark
embed-snippet.html      — snippet para embeber en WordPress/Divi
```

## Deploy en GitHub Pages (test en red)

1. Crear repo en GitHub (puede ser público).
2. Subir todos los archivos del proyecto al repo:
   ```bash
   git init
   git add .
   git commit -m "Initial version"
   git branch -M main
   git remote add origin https://github.com/USUARIO/REPO.git
   git push -u origin main
   ```
3. En GitHub → **Settings → Pages** → Source: `main` branch, folder `/ (root)` → Save.
4. En ~1-2 minutos queda disponible en `https://USUARIO.github.io/REPO/`.
5. Probar: abrir esa URL, subir un CSV, verificar que todas las pestañas funcionan.

## Deploy en hosting propio (producción)

Ver [embed-snippet.html](embed-snippet.html) para las instrucciones completas de embed en WordPress / Divi.

Resumen:
1. Subir vía cPanel (Banahost u otro) toda la carpeta a `/public_html/wc-analyzer/` o similar.
2. Verificar que `https://TUDOMINIO.com/wc-analyzer/index.html` responde 200.
3. Pegar el snippet de `embed-snippet.html` en un módulo Código de Divi en la página destino.

## Backend del estudio (opcional — activa la pestaña Benchmark)

La pestaña Benchmark compara al usuario contra percentiles del sector. Mientras no hay backend, muestra datos mock y encola localmente las contribuciones del usuario.

Para activarlo en producción (stack PHP + MySQL de Banahost):

1. Crear BD MySQL en cPanel.
2. Subir 2 endpoints PHP (a pedir al equipo de Lima Retail):
   - `contribute.php` — recibe POST con payload anónimo
   - `benchmarks.php` — devuelve percentiles por industria + tamaño
3. Editar `js/app.js` → `CONFIG`:
   ```js
   const CONFIG = {
     studyPostEndpoint:  'https://limaretail.com/wc-analyzer-api/contribute.php',
     studyFetchEndpoint: 'https://limaretail.com/wc-analyzer-api/benchmarks.php',
     ...
   };
   ```

### Qué se envía al backend (cuando el usuario acepta)

**Solo métricas agregadas y numéricas.** Nunca nombres, emails, teléfonos, SKUs, títulos de producto, direcciones ni categorías específicas. Ver función `buildContributionPayload()` en `app.js` para el payload exacto — el modal de consentimiento también permite al usuario inspeccionar el JSON antes de enviarlo.

## Persistencia y datos del usuario

| Storage | Qué guarda | Tamaño típico | Vida |
|---|---|---|---|
| `wc-analyzer-state-v1` | Los archivos parseados del usuario (productos, pedidos, clientes) + etiqueta de periodo | 100–800 KB | Hasta que el usuario pulse "Reiniciar" |
| `wc-analyzer-consent-v1` | Decisión de participar en el estudio + industria + tamaño | <1 KB | Permanente hasta cambiar |
| `wc-analyzer-contrib-queue` | Cola de contribuciones cuando backend está offline | <10 KB | Hasta envío exitoso |

Todo es `localStorage`, por navegador, por origen. Nunca sale automáticamente.

## Desarrollo local

Abrir `index.html` directamente en el navegador funciona para pruebas rápidas, pero **algunas features requieren servidor local** (fetch de Google Sheets bloqueado por CORS en `file://`).

Opciones:

```bash
# Python 3
python -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Luego abrir `http://localhost:8080/`.

## Licencia

Propietario — Lima Retail. Todos los derechos reservados.
