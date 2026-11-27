<?php
// This file is part of the local_pilo plugin for Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_pilo;

/**
 * La credencial firmada que le dice a Pilo quién pregunta.
 *
 * Es un JWT HS256 firmado aquí, en el servidor de Moodle, con la clave del sitio
 * que creó Pilo. Lleva solo lo necesario: el id de la persona en este Moodle,
 * su nombre de pila, su rol, el curso desde donde pregunta y sus cursos (hasta
 * 25). Nada de correo, documento ni notas. Vence en 5 minutos; la página pide
 * otra por AJAX (local_pilo_firma) cuando hace falta.
 *
 * @package    local_pilo
 * @copyright  2026 Universidad de Santander (UDES)
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class firma {

    /** Segundos que vale una credencial. */
    const DURACION = 300;

    /** Cursos que viajan como máximo. */
    const MAX_CURSOS = 25;

    /**
     * ¿El plugin está listo para firmar? Encendido, con sitio, clave y dirección https.
     *
     * @return bool
     */
    public static function listo(): bool {
        $cfg = get_config('local_pilo');
        return !empty($cfg->activo)
            && !empty($cfg->sitio) && preg_match('/^[a-z][a-z0-9-]{1,23}$/', $cfg->sitio)
            && !empty($cfg->clave) && strlen($cfg->clave) >= 32
            && !empty($cfg->url) && strpos($cfg->url, 'https://') === 0;
    }

    /**
     * El rol de la persona en un curso: profesor si puede ver todas las notas, estudiante si está matriculada.
     *
     * @param \context_course $ctx
     * @return string|null
     */
    protected static function rol_en(\context_course $ctx): ?string {
        global $USER;
        if (has_capability('moodle/grade:viewall', $ctx)) {
            return 'profesor';
        }
        if (is_enrolled($ctx, $USER, '', true)) {
            return 'estudiante';
        }
        return null;
    }

    /**
     * Un nombre de curso como texto plano y corto.
     *
     * @param string $nombre
     * @param \context $ctx
     * @return string
     */
    protected static function texto(string $nombre, \context $ctx): string {
        $t = format_string($nombre, true, ['context' => $ctx]);
        $t = html_entity_decode(strip_tags($t), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $t = trim(preg_replace('/\s+/u', ' ', $t));
        return \core_text::substr($t, 0, 120);
    }

    /**
     * Las afirmaciones de la credencial para la persona de la sesión.
     *
     * @param int $courseid El curso de la página (SITEID fuera de un curso).
     * @return array|null null si no hay sesión, es invitado o no puede usar a Pilo.
     */
    public static function afirmaciones(int $courseid): ?array {
        global $USER;
        if (!isloggedin() || isguestuser() || \core\session\manager::is_loggedinas()) {
            return null;
        }
        $sys = \context_system::instance();
        if (!has_capability('local/pilo:usar', $sys)) {
            return null;
        }

        $cursos = [];
        foreach (enrol_get_my_courses(['fullname'], 'visible DESC, fullname ASC', self::MAX_CURSOS) as $c) {
            $ctx = \context_course::instance($c->id);
            $rol = self::rol_en($ctx);
            if ($rol) {
                $cursos[] = ['id' => (int)$c->id, 'nombre' => self::texto($c->fullname, $ctx), 'rol' => $rol];
            }
        }

        $curso = null;
        if ($courseid > SITEID) {
            $c = get_course($courseid);
            $ctx = \context_course::instance($courseid);
            $rol = self::rol_en($ctx);
            if ($rol) {
                $curso = ['id' => (int)$courseid, 'nombre' => self::texto($c->fullname, $ctx), 'rol' => $rol];
            }
        }

        if ($curso) {
            $rol = $curso['rol'];
        } else if (has_capability('local/pilo:direccion', $sys)) {
            $rol = 'direccion';
        } else if (array_filter($cursos, function($x) {
            return $x['rol'] === 'profesor';
        })) {
            $rol = 'profesor';
        } else {
            $rol = 'estudiante';
        }

        $ahora = time();
        return [
            'iss' => 'local_pilo',
            'aud' => 'pilo-aula',
            'site' => get_config('local_pilo', 'sitio'),
            'sub' => (string)$USER->id,
            'nombre' => \core_text::substr(trim($USER->firstname), 0, 60),
            'rol' => $rol,
            'curso' => $curso,
            'cursos' => $cursos,
            'iat' => $ahora,
            'exp' => $ahora + self::DURACION,
            'jti' => bin2hex(random_bytes(8)),
        ];
    }

    /**
     * Base64 sin relleno, apto para URL.
     *
     * @param string $datos
     * @return string
     */
    protected static function b64(string $datos): string {
        return rtrim(strtr(base64_encode($datos), '+/', '-_'), '=');
    }

    /**
     * La credencial firmada, o null si no corresponde firmar.
     *
     * @param int $courseid
     * @return array|null ['firma' => string, 'exp' => int]
     */
    public static function para(int $courseid): ?array {
        if (!self::listo()) {
            return null;
        }
        $claims = self::afirmaciones($courseid);
        if (!$claims) {
            return null;
        }
        $cabeza = self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $cuerpo = self::b64(json_encode($claims, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $sello = self::b64(hash_hmac('sha256', $cabeza . '.' . $cuerpo, get_config('local_pilo', 'clave'), true));
        return ['firma' => $cabeza . '.' . $cuerpo . '.' . $sello, 'exp' => $claims['exp']];
    }

    /**
     * La línea de Pilo para el pie de página, o '' si no va en esta página.
     *
     * @return string
     */
    public static function etiqueta(): string {
        global $PAGE;
        if (during_initial_install() || (defined('AJAX_SCRIPT') && AJAX_SCRIPT) || (defined('CLI_SCRIPT') && CLI_SCRIPT)) {
            return '';
        }
        if (!self::listo()) {
            return '';
        }
        $sinpilo = ['embedded', 'popup', 'frametop', 'maintenance', 'redirect', 'print', 'login', 'secure'];
        if (in_array($PAGE->pagelayout, $sinpilo, true)) {
            return '';
        }
        $courseid = !empty($PAGE->course->id) ? (int)$PAGE->course->id : SITEID;
        if (get_config('local_pilo', 'alcance') !== 'todo' && $courseid <= SITEID) {
            return '';
        }
        $credencial = self::para($courseid);
        if (!$credencial) {
            return '';
        }
        $url = rtrim(get_config('local_pilo', 'url'), '/');
        return \html_writer::tag('script', '', [
            'src' => $url . '/pilo.js',
            'data-pilo' => 'ensenanza',
            'data-moodle' => get_config('local_pilo', 'sitio'),
            'data-firma' => $credencial['firma'],
            'data-curso' => $courseid,
            'data-esquina' => get_config('local_pilo', 'esquina') === 'izquierda' ? 'izquierda' : 'derecha',
            'defer' => 'defer',
        ]);
    }
}
