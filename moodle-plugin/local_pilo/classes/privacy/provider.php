<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_pilo\privacy;

use core_privacy\local\metadata\collection;

/**
 * Privacidad: el plugin no guarda nada en Moodle; envía datos a Pilo (servicio externo de la UDES).
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class provider implements \core_privacy\local\metadata\provider {

    /**
     * @param collection $collection
     * @return collection
     */
    public static function get_metadata(collection $collection): collection {
        $collection->add_external_location_link('pilo', [
            'userid' => 'privacy:metadata:pilo:userid',
            'firstname' => 'privacy:metadata:pilo:firstname',
            'courses' => 'privacy:metadata:pilo:courses',
            'question' => 'privacy:metadata:pilo:question',
        ], 'privacy:metadata:pilo');
        return $collection;
    }
}
