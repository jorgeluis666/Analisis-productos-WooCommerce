<?php
/**
 * Uninstall handler para Lima Retail Analyzer.
 *
 * Se ejecuta cuando el usuario DESINSTALA el plugin (no solo desactiva).
 * El plugin no crea tablas ni options persistentes, así que no hay nada que limpiar.
 *
 * @package LimaRetailAnalyzer
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Nada que limpiar: el plugin no crea options, tablas ni transients persistentes.
