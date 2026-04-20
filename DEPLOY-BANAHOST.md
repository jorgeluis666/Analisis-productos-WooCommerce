# Deploy a Banahost — Guía paso a paso

Tienes dos archivos listos para subir:

| Archivo | Qué es | Cuándo usarlo |
|---|---|---|
| **`woocommerce-analyzer.html`** | Todo el tool en un solo archivo (164 KB) | **Recomendado** — simplicidad máxima |
| `index.html` + `/css/` + `/js/` | Versión modular (source de trabajo) | Si planeas iterar y editar en Banahost |

La versión single-file es la más práctica para producción. La modular es mejor durante desarrollo en GitHub.

## Opción A — Single file (recomendada, 5 minutos)

### Paso 1 · Entrar al cPanel de Banahost
1. Login a `https://banahost.com/cpanel` (o la URL que te dio tu plan).
2. Busca **Administrador de archivos** (File Manager).

### Paso 2 · Crear carpeta del tool
1. Dentro de File Manager, navega a `public_html/`.
2. Click **+ Carpeta** (New Folder) → nombre: `wc-analyzer`.
3. Entra a la carpeta.

### Paso 3 · Subir el bundle
1. Click **Subir** (Upload) arriba.
2. Selecciona `D:\Análisis-productos-WooCommerce\woocommerce-analyzer.html`.
3. **Importante**: una vez subido, renómbralo a `index.html` (click derecho → Rename).
   De esa forma la URL queda limpia.

Estructura final esperada:
```
public_html/
  └── wc-analyzer/
      └── index.html     ← era woocommerce-analyzer.html
```

### Paso 4 · Probar
Abre en navegador:
```
https://limaretail.com/wc-analyzer/
```
Debe cargar el dashboard con el mensaje "Sube tus archivos de WooCommerce".

### Paso 5 · Embeber en la página de Divi
En tu editor Divi de `/analisis-de-ventas-en-woocommerce/` pega este snippet en un módulo **Código**:

```html
<style>
  .wc-analyzer-embed{position:relative;width:100%;background:#F3F4F6;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06)}
  .wc-analyzer-embed iframe{width:100%;border:0;display:block;min-height:900px}
</style>
<div class="wc-analyzer-embed">
  <iframe
    id="wc-analyzer-iframe"
    src="https://limaretail.com/wc-analyzer/"
    title="WooCommerce Sales Analyzer"
    loading="lazy"></iframe>
</div>
<script>
  (function(){
    var iframe = document.getElementById('wc-analyzer-iframe');
    window.addEventListener('message', function(e){
      if(!e.data || e.data.type !== 'wc-analyzer-height') return;
      if(e.source !== iframe.contentWindow) return;
      iframe.style.height = Math.max(900, Math.min(6000, e.data.height + 20)) + 'px';
    });
  })();
</script>
```

El iframe se ajusta solo al alto del contenido (postMessage).

---

## Opción B — Multi-file (si prefieres estructura modular)

Si quieres poder editar los archivos sueltos directamente en el hosting:

1. Sube a `public_html/wc-analyzer/`:
   - `index.html` (la versión con `?v=9` de cache busting)
   - Carpeta `css/` entera (con `styles.css`)
   - Carpeta `js/` entera (con `parser.js`, `analyzer.js`, `charts.js`, `app.js`)

2. Estructura final:
```
public_html/wc-analyzer/
  ├── index.html
  ├── css/styles.css
  └── js/
      ├── parser.js
      ├── analyzer.js
      ├── charts.js
      └── app.js
```

3. URL: misma que la Opción A.

---

## Troubleshooting

### 404 al abrir la URL
- Verifica que el archivo se llame exactamente `index.html` (no `Index.html` ni `woocommerce-analyzer.html`).
- Algunos hostings requieren permisos 644 en archivos y 755 en carpetas. En cPanel → click derecho → "Cambiar permisos".

### Página blanca con consola llena de errores CORS
- Solo ocurre si abres el archivo con `file://` local. En Banahost (HTTPS) no pasa.

### El iframe embebido aparece sin altura
- Revisa la consola del navegador en la página de Divi. Si ves errores de CORS en el postMessage, el iframe igual carga — solo el auto-resize falla. Aumenta el `min-height: 900px` a lo que necesites manualmente.

### WP Rocket o similar cachea el embed viejo
- Ajustes → WP Rocket → Borrar caché.
- O añade un `?v=2` al `src` del iframe para forzar recarga.

---

## Actualización futura

Cuando haya cambios en GitHub y quieras actualizar Banahost:

1. En tu carpeta local (`D:\Análisis-productos-WooCommerce`) haz `git pull origin main`.
2. Reconstruye el bundle:
   ```bash
   python3 build-bundle.py
   ```
   (te lo dejo listo como script, ver siguiente sección)
3. Sube el `woocommerce-analyzer.html` nuevo a Banahost, reemplazando el viejo.
4. Si usas WP Rocket / caché, borra caché de Divi.

---

## Backend del estudio (fase 2 — opcional)

Cuando estés listo para activar el benchmark real (hoy está en modo "próximamente"):

1. En cPanel → **MySQL Databases** → crea base `limaretail_study`.
2. Sube los archivos PHP `contribute.php` y `benchmarks.php` a
   `public_html/wc-analyzer-api/` (los genero cuando me lo pidas).
3. Edita en el bundle `CONFIG.studyPostEndpoint` y `CONFIG.studyFetchEndpoint`
   apuntando a tus nuevas URLs PHP.
4. Re-sube el bundle. Los usuarios opt-in empezarán a poblar la BD.
