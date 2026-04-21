=== Lima Retail — WooCommerce Analyzer ===
Contributors: limaretail
Tags: woocommerce, analytics, reports, sales, customer-insights
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Análisis avanzado de ventas, productos y clientes para WooCommerce. Exporta datos con un click y descubre patrones, bundles y clientes en riesgo.

== Description ==

**Lima Retail WooCommerce Analyzer** añade un panel de análisis profundo al admin de WooCommerce. Exporta tus datos con un solo click y súbelos al analyzer integrado para ver:

* **Pareto 80/20** de productos: qué pocos generan la mayoría de ingresos
* **Análisis basket**: qué productos se compran juntos
* **Ticket promedio** y distribución por tamaño de pedido
* **Análisis temporal**: ventas por día, semana, mes, día de la semana
* **Concentración VIP**: top 10% de clientes que generan X% de ingresos
* **Clientes en riesgo**: quiénes llevan >90 días sin comprar
* **Distribución geográfica**: por ciudad/región
* **Bundles recomendados** basados en co-compra real
* **Recencia**: segmentación por días desde última actividad
* **Insights accionables**: recomendaciones priorizadas por impacto

= Privacidad =

El análisis se ejecuta **100% en tu navegador**. Los CSVs se descargan a tu computadora, no viajan a servidores externos. Solo si aceptas opcionalmente, se envían métricas agregadas anónimas (sin nombres, emails ni PII) al estudio sectorial de Lima Retail.

= Compatibilidad =

* Compatible con **HPOS** (High-Performance Order Storage) de WooCommerce 8+
* PHP 7.4+
* WooCommerce 6.0+

== Installation ==

1. Descarga el ZIP del plugin
2. Ve a **Plugins → Añadir nuevo → Subir plugin**
3. Selecciona el ZIP descargado y haz click en **Instalar ahora**
4. Activa el plugin
5. En el menú admin, verás **Análisis LR** (con icono de gráfico)
6. Entra, exporta los 3 CSVs y súbelos al analyzer

== Frequently Asked Questions ==

= ¿Mis datos se envían a algún servidor externo? =

Por defecto, **no**. Los CSVs se descargan a tu computadora y el análisis corre en tu navegador. Opcionalmente puedes participar en el estudio anónimo sectorial, donde se envían solo métricas agregadas (sin nombres, emails, SKUs ni datos identificables).

= ¿Funciona con HPOS (High-Performance Order Storage)? =

Sí, el plugin declara compatibilidad con HPOS y usa `wc_get_orders()` que abstrae ambos modos de almacenamiento.

= ¿Qué tan rápido es el export para tiendas grandes? =

Para ~10,000 pedidos tarda unos 30-60 segundos. Para tiendas más grandes puede tomar varios minutos. No cierres la pestaña hasta que la descarga empiece.

= ¿Puedo ejecutar el analyzer offline? =

El analyzer vive en `https://limaretail.com/woocommerce-analytics/`. Si prefieres hostearlo tú mismo, contacta a Lima Retail.

== Screenshots ==

1. Panel de análisis: sidebar con botones de export + iframe del analyzer
2. Resumen del tool tras subir CSVs
3. Vista de co-compra (basket analysis)

== Changelog ==

= 1.0.1 =
* Procesamiento por lotes (500 pedidos por iteración) para soportar tiendas grandes sin agotar memoria.
* Hard cap de 30,000 pedidos por export (configurable vía LRA_MAX_ORDERS en wp-config.php).
* Pre-confirmación con el usuario cuando la tienda supera el cap, antes de lanzar descarga.
* Streaming de output: los CSVs se envían al browser mientras se generan, no esperan a tener todo en memoria.
* Banner de privacidad visible en el panel admin advirtiendo sobre manejo de PII (Ley 29733 Perú).

= 1.0.0 =
* Release inicial.
* Export de productos, pedidos y clientes a CSV.
* Compatibilidad HPOS declarada.
* UI admin con stats rápidas e iframe del analyzer.

== Upgrade Notice ==

= 1.0.1 =
Mejora de rendimiento para tiendas grandes + aviso legal de privacidad. Recomendado actualizar.

= 1.0.0 =
Primera versión pública.
