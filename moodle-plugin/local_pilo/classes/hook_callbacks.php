<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_pilo;

/**
 * Ganchos de Moodle 4.4 en adelante.
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class hook_callbacks {

    /**
     * Pone la línea de Pilo antes del pie de página.
     *
     * @param \core\hook\output\before_footer_html_generation $hook
     */
    public static function before_footer(\core\hook\output\before_footer_html_generation $hook): void {
        $html = firma::etiqueta();
        if ($html !== '') {
            $hook->add_html($html);
        }
    }
}
