<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Moodle 4.1 a 4.3: la línea de Pilo antes del pie de página.
 * Desde 4.4 la pone db/hooks.php y Moodle ya no llama esta función.
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * @return string
 */
function local_pilo_before_footer() {
    return \local_pilo\firma::etiqueta();
}
