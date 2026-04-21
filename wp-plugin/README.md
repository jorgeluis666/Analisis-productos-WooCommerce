# Lima Retail WooCommerce Analyzer — WP Plugin

Plugin instalable en cualquier WordPress con WooCommerce. Añade una página admin con:

- 3 botones para exportar Productos, Pedidos y Clientes como CSV
- Iframe embebido del analyzer en `limaretail.com/woocommerce-analytics/`
- Stats rápidas: # productos, # pedidos, # clientes
- Compatible con HPOS (High-Performance Order Storage)

## Estructura

```
wp-plugin/
├── lima-retail-analyzer/          ← carpeta del plugin
│   ├── lima-retail-analyzer.php   ← main file (plugin header + bootstrap)
│   ├── readme.txt                 ← WordPress plugin readme
│   ├── uninstall.php              ← cleanup on uninstall
│   ├── includes/
│   │   ├── class-lra-admin-page.php   ← UI del menú admin
│   │   └── class-lra-exporter.php     ← queries + CSV generation
│   └── assets/
│       └── admin.css              ← estilos del panel
├── build-plugin-zip.py            ← script para empaquetar
└── lima-retail-analyzer.zip       ← output (generado, no versionado)
```

## Build

```bash
cd wp-plugin/
python3 build-plugin-zip.py
```

Genera `lima-retail-analyzer.zip` (~11 KB) listo para subir a WordPress.

## Instalación en el cliente

1. WP Admin → **Plugins → Añadir nuevo → Subir plugin**
2. Selecciona `lima-retail-analyzer.zip`
3. **Instalar ahora** → **Activar**
4. En el menú lateral aparece **Análisis LR** (icono de gráfico)

## Flujo del usuario

1. Entra a Análisis LR
2. Ve 3 botones en el sidebar:
   - **Exportar Productos** — descarga CSV compatible con el analyzer
   - **Exportar Pedidos** — CSV agregado con columna `Producto(s)` concatenada
   - **Exportar Clientes** — CSV de todos los clientes (registrados + guest)
3. Hace click en los 3
4. Los CSVs aparecen en Descargas de su navegador
5. Arrastra los 3 al iframe del analyzer a la derecha
6. Ve el dashboard completo

## Seguridad

- `current_user_can('manage_woocommerce')` requerido en todos los endpoints
- Nonce (`check_admin_referer`) en el AJAX de export
- Sin endpoints REST expuestos públicamente
- Sin almacenamiento de datos persistentes (el plugin no crea tablas ni options)

## Compatibilidad

- WordPress 5.8+
- WooCommerce 6.0+
- PHP 7.4+
- HPOS declarada compatible vía `FeaturesUtil::declare_compatibility`

## Versionado

| Versión | Cambios |
|---|---|
| 1.0.0 | Release inicial: export de productos/pedidos/clientes + iframe del analyzer |

## Actualización futura

Para bumpear la versión:

1. Editar `lima-retail-analyzer/lima-retail-analyzer.php`:
   - Header: `Version: X.Y.Z`
   - Constante: `define('LRA_VERSION', 'X.Y.Z')`
2. Editar `lima-retail-analyzer/readme.txt`:
   - `Stable tag: X.Y.Z`
   - Nueva entrada en `== Changelog ==`
3. `python3 build-plugin-zip.py` → nuevo ZIP
4. Subir al cliente reemplazando el anterior
