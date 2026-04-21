<?php
/**
 * Página admin del plugin: menú + UI con iframe + botones de export.
 *
 * @package LimaRetailAnalyzer
 */

if (!defined('ABSPATH')) {
    exit;
}

class LRA_Admin_Page {

    const MENU_SLUG = 'lima-retail-analyzer';

    public static function init() {
        add_action('admin_menu', [__CLASS__, 'register_menu']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_assets']);
    }

    public static function register_menu() {
        add_menu_page(
            __('Lima Retail Analyzer', 'lima-retail-analyzer'),
            __('Análisis LR', 'lima-retail-analyzer'),
            'manage_woocommerce',
            self::MENU_SLUG,
            [__CLASS__, 'render_page'],
            'dashicons-chart-area',
            57 // justo después del menú de WooCommerce
        );
    }

    public static function enqueue_assets($hook) {
        if (strpos($hook, self::MENU_SLUG) === false) {
            return;
        }
        wp_enqueue_style(
            'lra-admin',
            LRA_PLUGIN_URL . 'assets/admin.css',
            [],
            LRA_VERSION
        );
    }

    public static function render_page() {
        $nonce        = wp_create_nonce('lra_export');
        $analyzer_url = esc_url(LRA_ANALYZER_URL);
        $export_endpoint = esc_url(admin_url('admin-ajax.php'));

        // Estadísticas rápidas para mostrar en la sidebar
        $counts = self::get_quick_counts();
        ?>
        <div class="wrap lra-wrap">
            <h1 class="lra-title">
                <span class="dashicons dashicons-chart-area"></span>
                Lima Retail — WooCommerce Analyzer
            </h1>

            <p class="lra-intro">
                Exporta tus datos de WooCommerce con un click y súbelos al analyzer para descubrir patrones de compra,
                ticket promedio, clientes en riesgo, ideas de bundles y mucho más.
                El análisis se ejecuta 100% en tu navegador — tus datos no se envían a servidores de Lima Retail
                sin tu consentimiento explícito.
            </p>

            <div class="lra-privacy-notice">
                <span class="dashicons dashicons-privacy"></span>
                <div>
                    <strong>Responsabilidad sobre datos personales</strong>
                    <p>
                        Los CSVs descargados contienen <strong>nombres, emails, teléfonos y direcciones de tus clientes</strong>.
                        Estos datos personales son tu responsabilidad bajo
                        <a href="https://www.gob.pe/institucion/minjus/normas-legales/243470-29733" target="_blank" rel="noopener">Ley 29733</a>
                        en Perú (o la normativa equivalente de tu país). Guárdalos de forma segura, no los compartas
                        en canales públicos ni los subas a servicios que no cumplan con protección de datos.
                    </p>
                </div>
            </div>

            <div class="lra-layout">
                <aside class="lra-sidebar">

                    <div class="lra-stats">
                        <div class="lra-stat">
                            <div class="lra-stat-val"><?php echo esc_html(number_format($counts['products'])); ?></div>
                            <div class="lra-stat-lbl">Productos</div>
                        </div>
                        <div class="lra-stat">
                            <div class="lra-stat-val"><?php echo esc_html(number_format($counts['orders'])); ?></div>
                            <div class="lra-stat-lbl">Pedidos</div>
                        </div>
                        <div class="lra-stat">
                            <div class="lra-stat-val"><?php echo esc_html(number_format($counts['customers'])); ?></div>
                            <div class="lra-stat-lbl">Clientes</div>
                        </div>
                    </div>

                    <h2>1. Exporta tus datos</h2>
                    <p class="lra-help">Click en cada botón para descargar el CSV. Genera los 3 antes de continuar.</p>

                    <button class="button button-primary lra-export-btn" data-type="products">
                        <span class="dashicons dashicons-products"></span>
                        <span class="lra-btn-label">Exportar Productos</span>
                    </button>

                    <button class="button button-primary lra-export-btn" data-type="orders">
                        <span class="dashicons dashicons-cart"></span>
                        <span class="lra-btn-label">Exportar Pedidos</span>
                    </button>

                    <button class="button button-primary lra-export-btn" data-type="customers">
                        <span class="dashicons dashicons-groups"></span>
                        <span class="lra-btn-label">Exportar Clientes</span>
                    </button>

                    <h2 style="margin-top:22px">2. Sube al analyzer</h2>
                    <p class="lra-help">
                        Arrastra los 3 CSVs que acabas de descargar al área del analyzer →
                        Puedes soltarlos todos juntos. El tool detecta cada tipo automáticamente.
                    </p>

                    <div class="lra-note">
                        <strong>100% privado.</strong><br>
                        Los CSVs se descargan a tu computadora. El análisis corre en tu navegador.
                        Ningún dato sale de tu equipo a menos que actives el estudio anónimo opt-in.
                    </div>

                    <div class="lra-footer">
                        <p>¿Dudas o problemas?</p>
                        <a href="https://limaretail.com/contacto" target="_blank" rel="noopener">Contacta Lima Retail →</a>
                        <p class="lra-version">v<?php echo esc_html(LRA_VERSION); ?></p>
                    </div>

                </aside>

                <main class="lra-iframe-wrap">
                    <iframe
                        src="<?php echo $analyzer_url; ?>?source=wp-plugin&v=<?php echo esc_attr(time() % 86400); ?>"
                        id="lra-analyzer-iframe"
                        title="WooCommerce Sales Analyzer"
                        loading="lazy"
                        allow="clipboard-read; clipboard-write">
                    </iframe>
                </main>
            </div>

            <input type="hidden" id="lra-nonce" value="<?php echo esc_attr($nonce); ?>">
            <input type="hidden" id="lra-endpoint" value="<?php echo $export_endpoint; ?>">
            <input type="hidden" id="lra-max-orders" value="<?php echo (int) LRA_MAX_ORDERS; ?>">
            <input type="hidden" id="lra-count-orders" value="<?php echo (int) $counts['orders']; ?>">
        </div>

        <script>
        (function () {
            var nonce        = document.getElementById('lra-nonce').value;
            var endpoint     = document.getElementById('lra-endpoint').value;
            var maxOrders    = parseInt(document.getElementById('lra-max-orders').value, 10);
            var countOrders  = parseInt(document.getElementById('lra-count-orders').value, 10);

            function fmt(n){ return n.toLocaleString('es-PE'); }

            document.querySelectorAll('.lra-export-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var type = this.dataset.type;

                    // Pre-check: si el tipo depende de orders y supera el cap, confirmar.
                    // El cap aplica a productos también porque los stats se derivan de orders.
                    if (countOrders > maxOrders) {
                        var msg = 'Tu tienda tiene ' + fmt(countOrders) + ' pedidos.\n\n' +
                                  'Por rendimiento, este export procesará los ' + fmt(maxOrders) + ' más recientes. ' +
                                  'Los pedidos anteriores no se incluirán.\n\n' +
                                  '¿Continuar?';
                        if (!confirm(msg)) return;
                    }

                    var label = this.querySelector('.lra-btn-label');
                    var icon  = this.querySelector('.dashicons');
                    var origLabel = label.textContent;
                    var origIcon  = icon.className;

                    btn.disabled = true;
                    label.textContent = 'Generando CSV…';
                    icon.className = 'dashicons dashicons-update lra-spin';

                    var url = endpoint + '?action=lra_export&type=' + encodeURIComponent(type) + '&_wpnonce=' + encodeURIComponent(nonce);
                    var a = document.createElement('a');
                    a.href = url;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // Restaurar después de 3s (descarga debe haber arrancado)
                    setTimeout(function () {
                        btn.disabled = false;
                        label.textContent = origLabel;
                        icon.className = origIcon;
                    }, 3000);
                });
            });
        })();
        </script>
        <?php
    }

    /**
     * Conteos rápidos para mostrar en el sidebar (sin cargar data pesada).
     */
    private static function get_quick_counts() {
        $products = wp_count_posts('product');
        $products_count = isset($products->publish) ? (int) $products->publish : 0;

        $orders_count = 0;
        if (function_exists('wc_get_orders')) {
            $orders_count = (int) wc_orders_count('completed') + (int) wc_orders_count('processing');
        }

        $customers = count_users();
        $customers_count = isset($customers['avail_roles']['customer']) ? (int) $customers['avail_roles']['customer'] : 0;

        return [
            'products'  => $products_count,
            'orders'    => $orders_count,
            'customers' => $customers_count,
        ];
    }
}
