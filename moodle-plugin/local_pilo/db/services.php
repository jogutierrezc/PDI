<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Servicio AJAX: una credencial nueva cuando la anterior está por vencer.
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_pilo_firma' => [
        'classname' => \local_pilo\external\firma::class,
        'methodname' => 'execute',
        'description' => 'Firma una credencial corta para que Pilo sepa quién pregunta.',
        'type' => 'read',
        'ajax' => true,
        'loginrequired' => true,
    ],
];
