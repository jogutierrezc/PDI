<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_pilo\external;

defined('MOODLE_INTERNAL') || die();

// Moodle 4.1 no tiene core_external: se usan las clases de lib/externallib.php con el mismo nombre.
if (!class_exists(\core_external\external_api::class)) {
    global $CFG;
    require_once($CFG->libdir . '/externallib.php');
    class_alias(\external_api::class, \core_external\external_api::class);
    class_alias(\external_function_parameters::class, \core_external\external_function_parameters::class);
    class_alias(\external_single_structure::class, \core_external\external_single_structure::class);
    class_alias(\external_value::class, \core_external\external_value::class);
}

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

/**
 * local_pilo_firma: una credencial nueva para la persona de la sesión.
 *
 * La pide pilo.js desde la misma página del aula (con la sesión y el sesskey de
 * Moodle) cuando la que trajo la página está por vencer.
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class firma extends external_api {

    /**
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'courseid' => new external_value(PARAM_INT, 'Curso de la página; 1 fuera de un curso', VALUE_DEFAULT, SITEID),
        ]);
    }

    /**
     * @param int $courseid
     * @return array
     */
    public static function execute(int $courseid = SITEID): array {
        $params = self::validate_parameters(self::execute_parameters(), ['courseid' => $courseid]);
        $courseid = (int)$params['courseid'];
        if ($courseid > SITEID) {
            // Solo firma un curso que la persona puede abrir.
            self::validate_context(\context_course::instance($courseid));
        } else {
            $courseid = SITEID;
            self::validate_context(\context_system::instance());
        }
        $credencial = \local_pilo\firma::para($courseid);
        return $credencial ?: ['firma' => '', 'exp' => 0];
    }

    /**
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'firma' => new external_value(PARAM_RAW, 'Credencial firmada (JWT HS256); vacía si no corresponde'),
            'exp' => new external_value(PARAM_INT, 'Vencimiento, en segundos Unix'),
        ]);
    }
}
