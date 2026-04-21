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
        </div>

        <script>
        (function () {
            var nonce    = document.getElementById('lra-nonce').value;
            var endpoint = document.getElementById('lra-endpoint').value;

            document.querySelectorAll('.lra-export-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var type = this.dataset.type;
                    var label = this.querySelector('.lra-btn-label');
                    var icon  = this.querySelector('.dashicons');
                    var origLabel = label.textContent;
                    var origIcon  = icon.className;

                    // UI: loading state
                    btn.disabled = true;
                    label.textContent = 'Generando CSV…';
                    icon.className = 'dashicons dashicons-update lra-spin';

                    // Trigger download
                    var url = endpoint + '?action=lra_export&type=' + encodeURIComponent(type) + '&_wpnonce=' + encodeURIComponent(nonce);
                    var a = document.createElement('a');
                    a.href = url;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    // Restore button after 2.5s (browser will have started download by then)
                    setTimeout(function () {
                        btn.disabled = false;
                        label.textContent = origLabel;
                        icon.className = origIcon;
                    }, 2500);
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
