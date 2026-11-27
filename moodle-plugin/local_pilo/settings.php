<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

/**
 * Ajustes del plugin: dónde vive Pilo, qué sitio es este Moodle y la clave de firma.
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_pilo', get_string('pluginname', 'local_pilo'));
    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configcheckbox(
        'local_pilo/activo',
        get_string('activo', 'local_pilo'),
        get_string('activo_desc', 'local_pilo'),
        0
    ));

    $settings->add(new admin_setting_configtext(
        'local_pilo/url',
        get_string('url', 'local_pilo'),
        get_string('url_desc', 'local_pilo'),
        'https://planeacion.udes.edu.co',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configtext(
        'local_pilo/sitio',
        get_string('sitio', 'local_pilo'),
        get_string('sitio_desc', 'local_pilo'),
        '',
        '/^[a-z][a-z0-9-]{1,23}$/'
    ));

    $settings->add(new admin_setting_configpasswordunmask(
        'local_pilo/clave',
        get_string('clave', 'local_pilo'),
        get_string('clave_desc', 'local_pilo'),
        ''
    ));

    $settings->add(new admin_setting_configselect(
        'local_pilo/alcance',
        get_string('alcance', 'local_pilo'),
        get_string('alcance_desc', 'local_pilo'),
        'cursos',
        [
            'cursos' => get_string('alcance_cursos', 'local_pilo'),
            'todo' => get_string('alcance_todo', 'local_pilo'),
        ]
    ));

    $settings->add(new admin_setting_configselect(
        'local_pilo/esquina',
        get_string('esquina', 'local_pilo'),
        '',
        'derecha',
        [
            'derecha' => get_string('esquina_derecha', 'local_pilo'),
            'izquierda' => get_string('esquina_izquierda', 'local_pilo'),
        ]
    ));
}
