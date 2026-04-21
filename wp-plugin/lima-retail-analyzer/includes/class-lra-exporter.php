<?php
/**
 * Exportador de CSVs para el Lima Retail Analyzer.
 *
 * Genera 3 formatos que matchean exactamente lo que el tool espera:
 * - Productos: columnas de WooCommerce Analytics → Products → Download CSV
 * - Pedidos:   columnas de WooCommerce Analytics → Orders   → Download CSV
 * - Clientes:  columnas de WooCommerce Analytics → Customers → Download CSV
 *
 * Características:
 * - Compatible con HPOS (High-Performance Order Storage) vía wc_get_orders
 * - Procesamiento por lotes (LRA_BATCH_SIZE, default 500) — evita OOM
 * - Hard cap (LRA_MAX_ORDERS, default 30000) — protege contra timeouts
 * - Streaming de output — los CSVs se envían al cliente mientras se generan
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
        if (!current_user_can('manage_woocommerce')) {
            wp_die('No tienes permisos para esta acción.', 'Acceso denegado', ['response' => 403]);
        }
        check_admin_referer('lra_export');

        $type = isset($_GET['type']) ? sanitize_text_field(wp_unslash($_GET['type'])) : '';

        @set_time_limit(0);
        @ini_set('memory_limit', '512M');
        // Desactivar compresión en tiempo real para que el streaming funcione
        if (function_exists('apache_setenv')) { @apache_setenv('no-gzip', '1'); }
        @ini_set('zlib.output_compression', 'Off');

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

    /** Headers HTTP para descarga de CSV + BOM UTF-8 (compat Excel). */
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
     * Flush de output buffer — envía bytes al cliente mientras seguimos generando.
     * Importante para exports grandes donde el browser esperaría sin feedback.
     */
    private static function flush_output() {
        if (ob_get_level() > 0) @ob_flush();
        @flush();
    }

    /**
     * Export Productos (matchea WooCommerce Analytics → Products).
     */
    private static function export_products() {
        self::send_csv_headers('products-report-export');
        $out = fopen('php://output', 'w');

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

        // PASO 1 — Agregar stats por producto iterando pedidos (por lotes).
        $product_stats = [];
        $page = 1;
        $processed = 0;
        $batch = LRA_BATCH_SIZE;
        $cap   = LRA_MAX_ORDERS;

        while (true) {
            $orders = wc_get_orders([
                'status'  => ['completed', 'processing'],
                'limit'   => $batch,
                'paged'   => $page,
                'type'    => 'shop_order',
                'orderby' => 'date',
                'order'   => 'DESC', // más recientes primero para respetar el cap
            ]);

            if (empty($orders)) break;

            foreach ($orders as $order) {
                if ($processed >= $cap) break 2;
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
                $processed++;
            }
            $page++;
        }

        // PASO 2 — Iterar productos por lotes y escribir rows.
        $page = 1;
        while (true) {
            $products = wc_get_products([
                'limit'   => $batch,
                'page'    => $page,
                'status'  => ['publish', 'private', 'draft'],
                'orderby' => 'menu_order',
                'order'   => 'ASC',
            ]);

            if (empty($products)) break;

            foreach ($products as $product) {
                $pid   = $product->get_id();
                $stats = $product_stats[$pid] ?? ['qty' => 0, 'revenue' => 0, 'orders' => []];

                $terms = wp_get_post_terms($pid, 'product_cat', ['fields' => 'names']);
                $categories = is_array($terms) ? implode(', ', $terms) : '';

                $variations = $product->is_type('variable') ? count($product->get_children()) : 0;

                $stock_status = $product->get_stock_status();
                $estado = 'N/D';
                if ($stock_status === 'instock')         $estado = 'Hay existencias';
                elseif ($stock_status === 'outofstock')  $estado = 'Sin existencias';
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

            $page++;
            self::flush_output();
        }

        fclose($out);
    }

    /**
     * Export Pedidos (matchea WooCommerce Analytics → Orders).
     * Formato agregado: una fila por pedido, con productos concatenados.
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

        $first_order_cache = [];
        $currency_symbol   = get_woocommerce_currency_symbol();
        $page      = 1;
        $processed = 0;
        $batch     = LRA_BATCH_SIZE;
        $cap       = LRA_MAX_ORDERS;

        while (true) {
            $orders = wc_get_orders([
                'limit'   => $batch,
                'paged'   => $page,
                'status'  => ['completed', 'processing', 'refunded'],
                'orderby' => 'date',
                'order'   => 'DESC',
                'type'    => 'shop_order',
            ]);

            if (empty($orders)) break;

            foreach ($orders as $order) {
                if ($processed >= $cap) break 2;

                $items_str = [];
                $total_qty = 0;
                foreach ($order->get_items() as $item) {
                    $qty  = (int) $item->get_quantity();
                    $name = $item->get_name();
                    $items_str[] = $qty . '× ' . $name;
                    $total_qty  += $qty;
                }

                $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
                if (empty($customer_name)) $customer_name = 'Invitado';

                $customer_type = 'new';
                $customer_id   = $order->get_customer_id();
                if ($customer_id) {
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

                $coupons = implode(', ', $order->get_coupon_codes());

                $gross    = (float) $order->get_total();
                $tax      = (float) $order->get_total_tax();
                $shipping = (float) $order->get_shipping_total();
                $net_sales = $gross - $tax - $shipping;

                $formatted_total = $currency_symbol . ' ' . number_format($gross, 2, '.', ',');
                $order_date = $order->get_date_created();

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
                    '',
                ]);
                $processed++;
            }

            $page++;
            self::flush_output();
        }

        fclose($out);
    }

    /**
     * Export Clientes (matchea WooCommerce Analytics → Customers).
     * Incluye registrados + guests (derivados de billing_email).
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

        // Agregar stats por customer_id (registrados) + por email (invitados)
        $stats = [];
        $page       = 1;
        $processed  = 0;
        $batch      = LRA_BATCH_SIZE;
        $cap        = LRA_MAX_ORDERS;

        while (true) {
            $orders = wc_get_orders([
                'limit'   => $batch,
                'paged'   => $page,
                'status'  => ['completed', 'processing'],
                'orderby' => 'date',
                'order'   => 'DESC',
                'type'    => 'shop_order',
            ]);

            if (empty($orders)) break;

            foreach ($orders as $order) {
                if ($processed >= $cap) break 2;

                $cust_id = (int) $order->get_customer_id();
                $email   = $order->get_billing_email();
                $key     = $cust_id > 0 ? 'u_' . $cust_id : 'g_' . strtolower(trim($email));

                if ($key === 'g_' || empty($key)) {
                    $processed++;
                    continue;
                }

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
                    $stats[$key]['name']      = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
                    $stats[$key]['country']   = $order->get_billing_country();
                    $stats[$key]['city']      = $order->get_billing_city();
                    $stats[$key]['state']     = $order->get_billing_state();
                    $stats[$key]['postcode']  = $order->get_billing_postcode();
                }

                $processed++;
            }

            $page++;
        }

        // Cache de datos de usuario registrado
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
