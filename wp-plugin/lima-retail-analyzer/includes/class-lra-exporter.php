<?php
/**
 * Exportador de CSVs para el Lima Retail Analyzer.
 *
 * Genera 3 formatos que matcheaen exactamente lo que el tool espera:
 * - Productos: columnas de WooCommerce Analytics → Products → Download CSV
 * - Pedidos:   columnas de WooCommerce Analytics → Orders   → Download CSV
 * - Clientes:  columnas de WooCommerce Analytics → Customers → Download CSV
 *
 * Compatible con HPOS (High-Performance Order Storage) vía wc_get_orders.
 *
 * @package LimaRetailAnalyzer
 */

if (!defined('ABSPATH')) {
    exit;
}

class LRA_Exporter {

    public static function init() {
        add_action('wp_ajax_lra_export', [__CLASS__, 'handle_export']);
    }

    public static function handle_export() {
        // Capability check
        if (!current_user_can('manage_woocommerce')) {
            wp_die('No tienes permisos para esta acción.', 'Acceso denegado', ['response' => 403]);
        }

        // Nonce check
        check_admin_referer('lra_export');

        $type = isset($_GET['type']) ? sanitize_text_field(wp_unslash($_GET['type'])) : '';

        // Prevent caching + allow long running
        @set_time_limit(0);
        @ini_set('memory_limit', '512M');

        switch ($type) {
            case 'products':
                self::export_products();
                break;
            case 'orders':
                self::export_orders();
                break;
            case 'customers':
                self::export_customers();
                break;
            default:
                wp_die('Tipo de export no válido.', 'Error', ['response' => 400]);
        }
        exit;
    }

    /** Headers HTTP para descarga de CSV + BOM UTF-8 para compatibilidad con Excel. */
    private static function send_csv_headers($prefix) {
        $filename = 'wc-' . $prefix . '-' . date('Y-m-d') . '.csv';
        header('Content-Type: text/csv; charset=UTF-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
        echo "\xEF\xBB\xBF"; // BOM
    }

    /**
     * Export Productos.
     *
     * Matcheaea el export de WooCommerce → Analytics → Products.
     */
    private static function export_products() {
        self::send_csv_headers('products-report-export');
        $out = fopen('php://output', 'w');

        // Header (exactamente como lo emite el export de WC Analytics)
        fputcsv($out, [
            'Título del producto',
            'SKU',
            'Artículos vendidos',
            'Ingresos netos',
            'Pedidos',
            'Categoría',
            'Variaciones',
            'Estado',
            'Inventario',
        ]);

        // Calcular estadísticas por producto iterando pedidos completos/en proceso.
        // Más confiable que queries directas, y HPOS-compatible.
        $product_stats = []; // product_id => ['qty','revenue','orders']

        $orders = wc_get_orders([
            'status' => ['completed', 'processing'],
            'limit'  => -1,
            'type'   => 'shop_order',
        ]);

        foreach ($orders as $order) {
            $order_id = $order->get_id();
            foreach ($order->get_items() as $item) {
                $pid = $item->get_product_id();
                if (!$pid) continue;
                if (!isset($product_stats[$pid])) {
                    $product_stats[$pid] = ['qty' => 0, 'revenue' => 0, 'orders' => []];
                }
                $product_stats[$pid]['qty']     += (int) $item->get_quantity();
                $product_stats[$pid]['revenue']  += (float) $item->get_subtotal();
                $product_stats[$pid]['orders'][$order_id] = true;
            }
        }

        // Iterar productos y escribir rows
        $products = wc_get_products([
            'limit'  => -1,
            'status' => ['publish', 'private', 'draft'],
            'orderby' => 'menu_order',
            'order'  => 'ASC',
        ]);

        foreach ($products as $product) {
            $pid   = $product->get_id();
            $stats = $product_stats[$pid] ?? ['qty' => 0, 'revenue' => 0, 'orders' => []];

            // Categorías (nombres, separados por coma)
            $terms = wp_get_post_terms($pid, 'product_cat', ['fields' => 'names']);
            $categories = is_array($terms) ? implode(', ', $terms) : '';

            // Variaciones
            $variations = $product->is_type('variable') ? count($product->get_children()) : 0;

            // Estado + inventario
            $stock_status = $product->get_stock_status();
            $estado = 'N/D';
            if ($stock_status === 'instock')    $estado = 'Hay existencias';
            elseif ($stock_status === 'outofstock') $estado = 'Sin existencias';
            elseif ($stock_status === 'onbackorder') $estado = 'Reserva';

            $stock_qty  = $product->get_stock_quantity();
            $inventario = ($stock_qty !== null) ? (int) $stock_qty : 'N/D';

            fputcsv($out, [
                $product->get_name(),
                $product->get_sku(),
                $stats['qty'],
                number_format($stats['revenue'], 2, '.', ''),
                count($stats['orders']),
                $categories,
                $variations,
                $estado,
                $inventario,
            ]);
        }

        fclose($out);
    }

    /**
     * Export Pedidos.
     *
     * Matcheaea el export de WooCommerce → Analytics → Orders.
     * Formato agregado: una fila por pedido, productos concatenados en "Producto(s)".
     */
    private static function export_orders() {
        self::send_csv_headers('orders-report-export');
        $out = fopen('php://output', 'w');

        fputcsv($out, [
            'Fecha',
            'Pedido #',
            'Ingresos netos (con formato)',
            'Estado',
            'Cliente',
            'Tipo de cliente',
            'Producto(s)',
            'Artículos vendidos',
            'Cupón(es)',
            'Ventas netas',
            'Atribución',
        ]);

        $orders = wc_get_orders([
            'limit'   => -1,
            'status'  => ['completed', 'processing', 'refunded'],
            'orderby' => 'date',
            'order'   => 'DESC',
            'type'    => 'shop_order',
        ]);

        // Cache de primer pedido por customer para determinar new/returning
        $first_order_cache = [];
        $currency_symbol = get_woocommerce_currency_symbol();

        foreach ($orders as $order) {
            // Productos concatenados como "1× Nombre, 2× Otro"
            $items_str = [];
            $total_qty = 0;
            foreach ($order->get_items() as $item) {
                $qty  = (int) $item->get_quantity();
                $name = $item->get_name();
                $items_str[] = $qty . '× ' . $name;
                $total_qty  += $qty;
            }

            // Cliente — nombre de facturación
            $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
            if (empty($customer_name)) $customer_name = 'Invitado';

            // Tipo de cliente — new si no tenía pedidos previos, returning si sí
            $customer_type = 'new';
            $customer_id   = $order->get_customer_id();
            $order_date    = $order->get_date_created();

            if ($customer_id && $order_date) {
                // Cachea el primer pedido del customer
                if (!isset($first_order_cache[$customer_id])) {
                    $prev = wc_get_orders([
                        'customer_id' => $customer_id,
                        'limit'       => 1,
                        'orderby'     => 'date',
                        'order'       => 'ASC',
                        'return'      => 'ids',
                        'type'        => 'shop_order',
                    ]);
                    $first_order_cache[$customer_id] = !empty($prev) ? (int) $prev[0] : 0;
                }
                $first_id = $first_order_cache[$customer_id];
                if ($first_id && $first_id !== $order->get_id()) {
                    $customer_type = 'returning';
                }
            }

            // Cupones usados
            $coupons = implode(', ', $order->get_coupon_codes());

            // Ventas netas = total - impuestos - envío
            $gross       = (float) $order->get_total();
            $tax         = (float) $order->get_total_tax();
            $shipping    = (float) $order->get_shipping_total();
            $net_sales   = $gross - $tax - $shipping;

            $formatted_total = $currency_symbol . ' ' . number_format($gross, 2, '.', ',');

            fputcsv($out, [
                $order_date ? $order_date->format('Y-m-d H:i:s') : '',
                $order->get_order_number(),
                $formatted_total,
                $order->get_status(),
                $customer_name,
                $customer_type,
                implode(', ', $items_str),
                $total_qty,
                $coupons,
                number_format($net_sales, 2, '.', ''),
                '', // Atribución — no disponible en core WC
            ]);
        }

        fclose($out);
    }

    /**
     * Export Clientes.
     *
     * Matcheaea el export de WooCommerce → Analytics → Customers.
     * Incluye clientes registrados e invitados (derivados de orders).
     */
    private static function export_customers() {
        self::send_csv_headers('customers-report-export');
        $out = fopen('php://output', 'w');

        fputcsv($out, [
            'Nombre',
            'Nombre de usuario',
            'Última actividad',
            'Registro',
            'Correo electrónico',
            'Pedidos',
            'Gasto total',
            'VMP',
            'País / Región',
            'Ciudad',
            'Región',
            'Código postal',
        ]);

        // Agregar stats por customer_id (registrados) y por email (invitados).
        $stats = []; // key => [order_count, total, last_date, billing_data]

        $orders = wc_get_orders([
            'limit'  => -1,
            'status' => ['completed', 'processing'],
            'type'   => 'shop_order',
        ]);

        foreach ($orders as $order) {
            $cust_id = (int) $order->get_customer_id();
            $email   = $order->get_billing_email();
            $key     = $cust_id > 0 ? 'u_' . $cust_id : 'g_' . strtolower(trim($email));

            if (empty($key) || $key === 'g_') continue;

            if (!isset($stats[$key])) {
                $stats[$key] = [
                    'is_guest'    => $cust_id === 0,
                    'customer_id' => $cust_id,
                    'email'       => $email,
                    'orders'      => 0,
                    'total'       => 0.0,
                    'last_date'   => '',
                    'name'        => '',
                    'country'     => '',
                    'city'        => '',
                    'state'       => '',
                    'postcode'    => '',
                ];
            }

            $stats[$key]['orders']++;
            $stats[$key]['total'] += (float) $order->get_total();

            $order_date = $order->get_date_created();
            $date_str   = $order_date ? $order_date->format('Y-m-d\TH:i:s') : '';
            if ($date_str > $stats[$key]['last_date']) {
                $stats[$key]['last_date'] = $date_str;
                // Capturar billing del pedido más reciente
                $stats[$key]['name']     = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
                $stats[$key]['country']  = $order->get_billing_country();
                $stats[$key]['city']     = $order->get_billing_city();
                $stats[$key]['state']    = $order->get_billing_state();
                $stats[$key]['postcode'] = $order->get_billing_postcode();
            }
        }

        // Cache de datos de usuario registrado (username, email, registered)
        $user_cache = [];
        foreach ($stats as $row) {
            if (!$row['is_guest'] && $row['customer_id'] > 0) {
                if (!isset($user_cache[$row['customer_id']])) {
                    $user_cache[$row['customer_id']] = get_userdata($row['customer_id']);
                }
            }
        }

        foreach ($stats as $row) {
            $username = '';
            $email    = $row['email'];
            $register = '';

            if (!$row['is_guest']) {
                $user = $user_cache[$row['customer_id']] ?? null;
                if ($user) {
                    $username = $user->user_login;
                    if (!$email) $email = $user->user_email;
                    $register = $user->user_registered ? mysql2date('Y-m-d\TH:i:s', $user->user_registered) : '';
                }
            }

            $vmp = $row['orders'] > 0 ? $row['total'] / $row['orders'] : 0;

            fputcsv($out, [
                $row['name'] ?: 'Invitado',
                $username,
                $row['last_date'],
                $register,
                $email,
                $row['orders'],
                number_format($row['total'], 2, '.', ''),
                number_format($vmp, 2, '.', ''),
                $row['country'],
                $row['city'],
                $row['state'],
                $row['postcode'],
            ]);
        }

        fclose($out);
    }
}
