<?php
/**
 * Plugin Name:       Lima Retail — WooCommerce Analyzer
 * Plugin URI:        https://limaretail.com/woocommerce-analytics/
 * Description:       Análisis avanzado de ventas, productos y clientes para tu tienda WooCommerce. Exporta datos con un click y descubre patrones de compra, bundles recomendados y clientes en riesgo.
 * Version:           1.0.0
 * Author:            Lima Retail
 * Author URI:        https://limaretail.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       lima-retail-analyzer
 * Requires PHP:      7.4
 * Requires at least: 5.8
 * WC requires at least: 6.0
 * WC tested up to:   9.5
 *
 * @package LimaRetailAnalyzer
 */

if (!defined('ABSPATH')) {
    exit;
}

define('LRA_VERSION', '1.0.0');
define('LRA_PLUGIN_FILE', __FILE__);
define('LRA_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('LRA_PLUGIN_URL', plugin_dir_url(__FILE__));
define('LRA_ANALYZER_URL', 'https://limaretail.com/woocommerce-analytics/');

// Declarar compatibilidad con HPOS (High-Performance Order Storage) de WooCommerce
add_action('before_woocommerce_init', function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

// Bootstrap
add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-error"><p><strong>Lima Retail Analyzer</strong> requiere que WooCommerce esté instalado y activo.</p></div>';
        });
        return;
    }

    require_once LRA_PLUGIN_DIR . 'includes/class-lra-admin-page.php';
    require_once LRA_PLUGIN_DIR . 'includes/class-lra-exporter.php';

    LRA_Admin_Page::init();
    LRA_Exporter::init();
});
