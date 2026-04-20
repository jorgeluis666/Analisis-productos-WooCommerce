#!/usr/bin/env python3
"""
Construye `woocommerce-analyzer.html`: un bundle self-contained con todo
el HTML, CSS y JS inlineado en un solo archivo listo para subir a Banahost.

Uso:
    python3 build-bundle.py

El único dependency externa es SheetJS via CDN.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with open(os.path.join(HERE, path), 'r', encoding='utf-8') as f:
        return f.read()

css        = read('css/styles.css')
parser_js  = read('js/parser.js')
analyzer_js= read('js/analyzer.js')
charts_js  = read('js/charts.js')
app_js     = read('js/app.js')

HTML = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<title>WooCommerce Sales Analyzer · Lima Retail</title>
<!--
  ═══════════════════════════════════════════════════════════════
  BUNDLE SELF-CONTAINED — LISTO PARA DEPLOY
  ═══════════════════════════════════════════════════════════════
  HTML + CSS + JS inlineados. Solo depende de SheetJS (CDN) para
  leer archivos XLSX.

  DEPLOY Banahost:
  1. Renombra este archivo a `index.html`
  2. Súbelo a /public_html/wc-analyzer/ via cPanel File Manager
  3. Accede en https://TU-DOMINIO.com/wc-analyzer/

  100% procesamiento local. Ningún dato sale del navegador salvo
  con consentimiento explícito del usuario (modal opt-in).
  ═══════════════════════════════════════════════════════════════
-->
<style>
{css}
</style>
</head>
<body>
<div id="app"></div>
<div id="toast" class="toast"></div>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script>
{parser_js}
</script>
<script>
{analyzer_js}
</script>
<script>
{charts_js}
</script>
<script>
{app_js}
</script>
</body>
</html>
'''

out = os.path.join(HERE, 'woocommerce-analyzer.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(HTML)

size_kb = os.path.getsize(out) / 1024
print(f'[OK] Bundle creado: woocommerce-analyzer.html ({size_kb:.1f} KB)')
print(f'     Subelo a Banahost renombrado a index.html')
