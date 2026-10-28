-- =============================================================================
-- PDI · 0241 · THE Impact · correos: plantillas c-thi-*, cola, recordatorios y resumen semanal
--
-- Requiere 0137 y 0177 (correos), 0213 (ayudas de fecha ugm_*), 0237 y 0240. Idempotente.
-- Función a desplegar: `correos` (acción nueva `thi_cola`; el código de la cola ahora se
-- comparte con UI GreenMetric, ver supabase/functions/correos). También cambió la lista de
-- variables de las plantillas «aviso» (nueva: {{oficina}}), igual en
-- src/modules/admin/correos/servidor-logica.ts.
--
-- CÓMO FUNCIONA (igual que 0213 para UI GreenMetric)
--  · Las transiciones del flujo de 0149 (asignar, enviar, devolver, aprobar) y las tareas
--    programadas escriben filas en `thi_notificaciones` (la cola). Nada se envía desde
--    la base. Los ganchos thi_encolar_* los llaman los disparadores AFTER de 0240, que
--    atrapan cualquier error: un aviso que falle no puede frenar el flujo.
--  · La función `correos` (acción `thi_cola`) toma lotes con thi_cola_tomar, arma cada
--    correo con la plantilla EDITABLE `c-thi-*` (pantalla Correos), lo envía por el SMTP
--    de la intranet con los topes del módulo y anota el resultado con thi_cola_resultado.
--  · Los avisos salen SOLO con el ciclo en estado «abierto» y `thi_config.avisos_activos`.
--    Así la importación del Excel o la asignación masiva en «preparación» no inundan los
--    buzones. Quienes reciben el aviso de una oficina son sus editores y jefes (Contribuyente
--    y Gestor); quienes reciben «se presentó» y el resumen, la administración.
--
-- SEGURIDAD (mismas razones que 0213)
--  1. La cola y sus funciones de tomar/anotar son SOLO del rol de servicio.
--  2. Las filas llevan valores sueltos; el diseño sale de la plantilla. Los valores se
--     insertan escapados y la función quita cualquier «{{ }}».
--  3. El destinatario es siempre una persona activa de la intranet (profiles).
--  4. La clave única impide duplicar un aviso (recordatorio del día, asignación).
--  5. Hasta 3 intentos; un fallo no frena el resto del lote.
--
-- LAS PLANTILLAS son las seis del flujo, con el diseño de
-- src/modules/rankings/thimpact/lib/correo-html.ts (HTML en tablas y estilos en línea,
-- alcance «completo»). Se insertan «si no existen» para no pisar lo que la administración
-- haya editado. Para volver al texto original de una, bórrela en la pantalla Correos y
-- vuelva a aplicar esta migración.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Plantillas editables (pantalla Correos)
-- -----------------------------------------------------------------------------

insert into public.correo_templates (key, identity, grp, name, sent_when, action, subject, preheader, title, greeting, body, button, note, active, sort, tipo, html_scope, html)
values
  ('c-thi-asignacion', 'plan', 'THE Impact', 'Le asignaron un indicador', 'Al asignar un indicador a una oficina (con el ciclo abierto)', 'thi',
   'Le asignaron {{indicador}} del reporte de THE Impact', 'Fecha límite: {{fecha_limite}}', 'Le asignaron {{indicador}}', 'Hola, {{nombre}}.',
   'Planeación asignó a su oficina ({{oficina}}) el indicador {{indicador}} del reporte de THE Impact, {{categoria}}.
Pregunta de THE: {{pregunta}}.
Fecha límite: {{fecha_limite}}.',
   'Abrir el indicador', 'Si no le corresponde, avise a Planeación para reasignarlo.', true, 410, 'aviso', 'completo',
   $html$<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Universidad de Santander" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png" alt="THE Impact Rankings" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1b52ad;">UDES Sostenible &bull; Nueva asignación</p>
              <h1 style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #0a2d63;">Indicador asignado a su oficina</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">Planeación Institucional asignó a su oficina un indicador del reporte de <strong>THE Impact Rankings</strong>. Estos son sus datos:</p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">ODS</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{categoria}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Indicador</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 700; color: #0a2d63;">{{indicador}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Pregunta de THE</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{pregunta}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Oficina</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{oficina}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Fecha límite</td>
                  <td style="padding: 16px 20px; font-size: 14px; font-weight: 500; color: #0f172a;">{{fecha_limite}}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #1b52ad; border-radius: 6px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1e3a8a;">Qué se espera de la oficina</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1e3a8a;">Responda con el dato o el sí/no que pide THE, agregue una evidencia (mejor un enlace público) y envíe el indicador a revisión antes de la fecha límite.</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0a2d63;">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">Abrir el indicador &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">Si el indicador no le corresponde, avise a Planeación para reasignarlo.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">Universidad de Santander — UDES Sostenible</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>$html$),
  ('c-thi-recordatorio', 'plan', 'THE Impact', 'Indicadores por entregar', 'Recordatorio por persona: 7, 3 y 1 día antes y el día del vencimiento', 'thi',
   'THE Impact: {{cantidad}} por entregar, el primero {{dias}}', 'El primero vence el {{fecha_limite}}', 'Tiene {{cantidad}} por entregar', 'Hola, {{nombre}}.',
   'Estos indicadores del reporte de THE Impact siguen abiertos: {{lista}}.
El primero en vencer es el del {{fecha_limite}} ({{dias}}).',
   'Abrir mis indicadores', 'Un indicador enviado a revisión deja de aparecer aquí.', true, 411, 'aviso', 'completo',
   $html$<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Universidad de Santander" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png" alt="THE Impact Rankings" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #b45309;">UDES Sostenible &bull; Recordatorio</p>
              <h1 style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #0a2d63;">Indicadores por entregar</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">Su oficina tiene <strong>{{cantidad}}</strong> del reporte de <strong>THE Impact Rankings</strong> sin enviar a revisión.</p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Primer vencimiento</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 700; color: #b45309;">{{fecha_limite}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Plazo</td>
                  <td style="padding: 16px 20px; font-size: 14px; font-weight: 500; color: #0f172a;">{{dias}}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; border-radius: 6px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #92400e;">Pendientes</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #78350f;">{{lista}}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0a2d63;">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">Abrir mis indicadores &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">Un indicador enviado a revisión deja de aparecer en este recordatorio.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">Universidad de Santander — UDES Sostenible</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>$html$),
  ('c-thi-enviado', 'plan', 'THE Impact', 'Se presentó un indicador', 'Cuando una oficina envía un indicador a revisión', 'thi',
   'Se presentó {{indicador}}: pendiente de revisión', '{{oficina}} espera su revisión', '{{indicador}} espera revisión', 'Hola, {{nombre}}.',
   '{{autor}} ({{oficina}}) envió {{pregunta}} ({{indicador}}) para revisión, con {{cantidad}}.
{{categoria}}.',
   'Revisar ahora', '', true, 412, 'aviso', 'completo',
   $html$<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Universidad de Santander" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png" alt="THE Impact Rankings" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1b52ad;">UDES Sostenible &bull; Pendiente de revisión</p>
              <h1 style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #0a2d63;">Un indicador espera su revisión</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;"><strong>{{autor}}</strong> envió un indicador del reporte de <strong>THE Impact Rankings</strong> para su revisión técnica:</p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">ODS</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{categoria}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Indicador</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 700; color: #0a2d63;">{{indicador}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Pregunta de THE</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{pregunta}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Oficina</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{oficina}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Evidencias</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{cantidad}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Estado del registro</td>
                  <td style="padding: 16px 20px; font-size: 14px; font-weight: 700; color: #1b52ad;">En revisión</td>
                </tr>
              </table>

              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0a2d63;">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">Revisar ahora &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">Puede aprobarlo o devolverlo con observaciones desde la misma pantalla.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">Universidad de Santander — UDES Sostenible</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>$html$),
  ('c-thi-devuelto', 'plan', 'THE Impact', 'Un indicador volvió con observaciones', 'Cuando Planeación devuelve una respuesta con observaciones', 'thi',
   '{{indicador}} volvió con observaciones', 'Hay que corregirlo antes del {{fecha_limite}}', '{{indicador}} volvió con observaciones', 'Hola, {{nombre}}.',
   '{{revisor}} devolvió {{pregunta}} ({{indicador}}).
Observaciones: «{{comentario}}»
Corríjalo y envíelo de nuevo.',
   'Atender observaciones y reenviar', '', true, 413, 'aviso', 'completo',
   $html$<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Universidad de Santander" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png" alt="THE Impact Rankings" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #dc2626;">UDES Sostenible &bull; Solicitud de Ajustes</p>
              <h1 style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #0a2d63;">Indicador devuelto con observaciones</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">Tras la revisión técnica del indicador <strong>{{indicador}}</strong> para el reporte <strong>THE Impact Rankings</strong>, se han formulado observaciones que requieren su intervención antes de proceder con la aprobación definitiva:</p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Pregunta / Código</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 700; color: #0a2d63;">{{pregunta}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Indicador</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{indicador}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Revisado por</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{revisor}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Estado del registro</td>
                  <td style="padding: 16px 20px; font-size: 14px; font-weight: 700; color: #dc2626;">Requiere corrección</td>
                </tr>
              </table>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; border-radius: 6px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Observaciones del evaluador:</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; font-style: italic; color: #7f1d1d;">«{{comentario}}»</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0a2d63;">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">Atender observaciones y reenviar &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">Una vez aplicados los ajustes en la plataforma, remita nuevamente el indicador para dar continuidad al flujo de validación.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">Universidad de Santander — UDES Sostenible</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>$html$),
  ('c-thi-aprobado', 'plan', 'THE Impact', 'Aprobaron un indicador', 'Cuando Planeación aprueba una respuesta', 'thi',
   'Aprobaron {{indicador}}', '{{indicador}} quedó aprobado', '{{indicador}} quedó aprobado', 'Hola, {{nombre}}.',
   '{{revisor}} aprobó {{pregunta}} ({{indicador}}).
Ya no se puede editar. Si hace falta un cambio, pida a Planeación que lo reabra.',
   'Ver el indicador', '', true, 414, 'aviso', 'completo',
   $html$<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Universidad de Santander" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png" alt="THE Impact Rankings" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #16a34a;">UDES Sostenible &bull; Indicador aprobado</p>
              <h1 style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #0a2d63;">Indicador aprobado</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">El indicador <strong>{{indicador}}</strong> del reporte de <strong>THE Impact Rankings</strong> superó la revisión técnica. Gracias por el trabajo de su oficina.</p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">ODS</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{categoria}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Indicador</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 700; color: #0a2d63;">{{indicador}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Pregunta de THE</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{pregunta}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Aprobado por</td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #edf2f7; font-size: 14px; font-weight: 500; color: #0f172a;">{{revisor}}</td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; width: 34%; font-size: 13px; font-weight: 600; color: #64748b;">Estado del registro</td>
                  <td style="padding: 16px 20px; font-size: 14px; font-weight: 700; color: #15803d;">Aprobado</td>
                </tr>
              </table>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 6px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #166534;">Siguiente paso</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #14532d;">Planeación lo incluye en la lista de entrega a THE cuando la evidencia esté completa.</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0a2d63;">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">Ver el indicador &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">El indicador ya no se puede editar. Si hace falta un cambio, pida a Planeación que lo reabra.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">Universidad de Santander — UDES Sostenible</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>$html$),
  ('c-thi-resumen', 'plan', 'THE Impact', 'Resumen semanal del reporte', 'Una vez por semana, a quien administra el ranking', 'thi',
   'THE Impact: resumen semanal', 'Estado del reporte esta semana', 'Resumen semanal', 'Hola, {{nombre}}.',
   'Estado del reporte de THE Impact: {{lista}}.',
   'Abrir el tablero', '', true, 415, 'aviso', 'completo',
   $html$<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #edf2f7;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle" style="width: 50%;">
                    <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="Universidad de Santander" height="42" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                  <td align="right" valign="middle" style="width: 50%;">
                    <img src="https://qiu.edu.my/cri/wp-content/uploads/2023/02/theimpactranking.png" alt="THE Impact Rankings" height="38" style="display: block; max-width: 170px; height: auto; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 40px 24px 40px;">
              <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #1b52ad;">UDES Sostenible &bull; Resumen semanal</p>
              <h1 style="margin: 0 0 20px 0; font-family: Georgia, 'Times New Roman', serif; font-size: 24px; line-height: 1.3; font-weight: 700; color: #0a2d63;">Así va el reporte de THE Impact</h1>
              <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">Estimado(a) <strong>{{nombre}}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">Este es el estado del reporte de <strong>THE Impact Rankings</strong> al comenzar la semana:</p>

              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #1b52ad; border-radius: 6px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #1e3a8a;">Estado del ciclo</p>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #1e3a8a;">{{lista}}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto 28px auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #0a2d63;">
                    <a href="{{enlace}}" target="_blank" style="display: inline-block; padding: 14px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 6px; letter-spacing: 0.02em;">Abrir el tablero &rarr;</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; text-align: center;">Se envía una vez por semana mientras el ciclo esté abierto.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #edf2f7; text-align: center;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; color: #334155;">Universidad de Santander — UDES Sostenible</p>
              <p style="margin: 0; font-size: 11px; line-height: 1.4; color: #94a3b8;">Gestión de Rankings y Métricas Institucionales &bull; Notificación Oficial del Sistema</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>$html$)

on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- 2. Ayudas de texto
-- -----------------------------------------------------------------------------

/** «4.3.1 · Título corto» (60 caracteres como máximo, lo que admite la función de correos). */
create or replace function public.thi_etiqueta(p_ciclo uuid, p_indicador text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(split_part(p_indicador, '/', 1) || coalesce(' · ' || nullif(btrim(rq.titulo), ''), ''), 60)
    from (select 1) x left join lateral public.thi_requisito(p_ciclo, p_indicador) rq on true;
$$;

/** La pregunta de THE, en una línea (300 caracteres). Sale de la metodología; si no está, del catálogo en español. */
create or replace function public.thi_pregunta(p_ciclo uuid, p_indicador text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select left(regexp_replace(coalesce(nullif(btrim(rq.pregunta), ''), (select i.texto_es from public.ranking_indicators i where i.ciclo = p_ciclo and i.id = split_part(p_indicador, '/', 1)), ''), '\s+', ' ', 'g'), 300)
    from (select 1) x left join lateral public.thi_requisito(p_ciclo, p_indicador) rq on true;
$$;

create or replace function public.thi_ods_etiqueta(p_ciclo uuid, p_indicador text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'ODS ' || o || ' · ' || public.thi_ods_nombre(o)
    from (select coalesce((select i.ods::int from public.ranking_indicators i where i.ciclo = p_ciclo and i.id = split_part(p_indicador, '/', 1)),
                          nullif(split_part(p_indicador, '.', 1), '')::int) as o) s;
$$;

/** Quién recibe lo de una oficina: sus editores y jefes activos (Contribuyente y Gestor). */
create or replace function public.thi_destinatarios_unidad(p_unidad uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.profile_id from public.unit_members m join public.profiles p on p.id = m.profile_id
   where m.unit_id = p_unidad and m.role in ('jefe', 'editor') and p.is_active;
$$;

/** Quién recibe los avisos de la administración: la lista del ciclo o, vacía, todas las personas activas con rol Planeación o más. */
create or replace function public.thi_destinatarios_admin(p_ciclo uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id from public.profiles p
   where p.is_active
     and ((exists (select 1 from public.thi_config c where c.ciclo_id = p_ciclo and cardinality(c.avisar_a) > 0 and p.id = any (c.avisar_a)))
          or (not exists (select 1 from public.thi_config c where c.ciclo_id = p_ciclo and cardinality(c.avisar_a) > 0)
              and p.role in ('planeacion', 'admin')));
$$;

/** ¿Este ciclo manda avisos ahora? Abierto y con los avisos activos. */
create or replace function public.thi_avisa(p_ciclo uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ranking_cycles c join public.thi_config f on f.ciclo_id = c.id
     where c.id = p_ciclo and c.ranking = 'the-impact' and c.estado = 'abierto' and f.avisos_activos);
$$;

-- -----------------------------------------------------------------------------
-- 3. Ganchos de transición (reemplazan los vacíos de 0240)
-- -----------------------------------------------------------------------------

create or replace function public.thi_encolar_asignacion(p_ciclo uuid, p_indicador text, p_unidad uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_fecha date;
  v_resp uuid;
  x record;
begin
  if p_rol <> 'principal' or not public.thi_avisa(p_ciclo) then return; end if;
  select fecha_limite into v_fecha from public.ranking_cycles where id = p_ciclo;
  select id into v_resp from public.ranking_responses where ciclo = p_ciclo and indicador = p_indicador and unidad = p_unidad;
  v_base := jsonb_build_object('indicador', public.thi_etiqueta(p_ciclo, p_indicador), 'pregunta', public.thi_pregunta(p_ciclo, p_indicador),
                               'categoria', public.thi_ods_etiqueta(p_ciclo, p_indicador),
                               'oficina', left(coalesce((select u.name from public.units u where u.id = p_unidad), ''), 160),
                               'fecha_limite', public.ugm_fecha_larga(v_fecha),
                               'ruta', '/admin/reporte-rankings?oficina=' || p_unidad || '&indicador=' || split_part(p_indicador, '/', 1));
  for x in select d from public.thi_destinatarios_unidad(p_unidad) d loop
    insert into public.thi_notificaciones (ciclo_id, respuesta_id, destinatario, plantilla, valores, clave_unica)
    values (p_ciclo, v_resp, x.d, 'c-thi-asignacion', v_base, 'asig:' || p_ciclo || ':' || p_indicador || ':' || p_unidad || ':' || x.d)
    on conflict (clave_unica) where clave_unica is not null do nothing;
  end loop;
end;
$$;

create or replace function public.thi_encolar_estado(p_antes public.ranking_responses, p_despues public.ranking_responses)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_fecha date;
  v_autor text := coalesce((select pr.full_name from public.profiles pr where pr.id = auth.uid()), '');
  v_n int;
  x record;
begin
  if not public.thi_avisa(p_despues.ciclo) then return; end if;
  select fecha_limite into v_fecha from public.ranking_cycles where id = p_despues.ciclo;
  v_base := jsonb_build_object('indicador', public.thi_etiqueta(p_despues.ciclo, p_despues.indicador), 'pregunta', public.thi_pregunta(p_despues.ciclo, p_despues.indicador),
                               'categoria', public.thi_ods_etiqueta(p_despues.ciclo, p_despues.indicador),
                               'oficina', left(coalesce((select u.name from public.units u where u.id = p_despues.unidad), ''), 160),
                               'fecha_limite', public.ugm_fecha_larga(v_fecha));
  if p_despues.estado = 'sent' and p_antes.estado is distinct from 'sent' then
    v_n := public.thi_n_evidencias(p_despues.id);
    for x in select d from public.thi_destinatarios_admin(p_despues.ciclo) d where d is distinct from auth.uid() loop
      insert into public.thi_notificaciones (ciclo_id, respuesta_id, destinatario, plantilla, valores)
      values (p_despues.ciclo, p_despues.id, x.d, 'c-thi-enviado',
              v_base || jsonb_build_object('autor', v_autor, 'cantidad', case when v_n = 0 then 'ninguna evidencia' when v_n = 1 then '1 evidencia' else v_n || ' evidencias' end,
                                           'ruta', '/admin/rankings/impact?q=' || split_part(p_despues.indicador, '/', 1)));
    end loop;
  elsif p_despues.estado in ('back', 'ok') and p_antes.estado is distinct from p_despues.estado then
    for x in select d from public.thi_destinatarios_unidad(p_despues.unidad) d where d is distinct from auth.uid() loop
      insert into public.thi_notificaciones (ciclo_id, respuesta_id, destinatario, plantilla, valores)
      values (p_despues.ciclo, p_despues.id, x.d, case p_despues.estado when 'back' then 'c-thi-devuelto' else 'c-thi-aprobado' end,
              v_base || jsonb_build_object('revisor', v_autor, 'comentario', left(coalesce(p_despues.nota_revision, ''), 600),
                                           'ruta', '/admin/reporte-rankings?oficina=' || p_despues.unidad || '&indicador=' || split_part(p_despues.indicador, '/', 1)));
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Recordatorios y resumen semanal (los programa el usuario; ver el final)
-- -----------------------------------------------------------------------------

/**
 * Prepara en la cola un correo por persona y oficina con lo que le vence en los días configurados (7, 3, 1 y 0) y, los
 * lunes, lo ya vencido. Solo ciclos abiertos con fecha límite y avisos activos; solo indicadores de los ODS priorizados con
 * oficina principal cuya respuesta no se ha enviado (sin empezar, en borrador o devuelta). Repetirla el mismo día no duplica.
 * Devuelve cuántos correos preparó.
 */
create or replace function public.thi_programar_recordatorios(p_hoy date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, public.ugm_hoy());
  x record;
  y record;
  v_n int := 0;
  v_id uuid;
begin
  if auth.uid() is not null and not public.thi_es_admin() then
    raise exception 'Solo la administración del ranking prepara los recordatorios.' using errcode = '42501';
  end if;
  for x in
    select s.ciclo, s.unidad, s.fecha, s.cantidad, s.lista
      from (
        select a.ciclo, a.unidad, cy.fecha_limite as fecha, cf.recordatorio_dias,
               count(*)::int as cantidad,
               string_agg(public.thi_etiqueta(a.ciclo, a.indicador), '; ' order by ri.ods, ri.orden) as lista
          from public.ranking_assignments a
          join public.ranking_cycles cy on cy.id = a.ciclo and cy.ranking = 'the-impact' and cy.estado = 'abierto' and cy.fecha_limite is not null
          join public.thi_config cf on cf.ciclo_id = cy.id and cf.avisos_activos
          join public.ranking_indicators ri on ri.ciclo = a.ciclo and ri.id = a.indicador and ri.nivel = 'indicator' and ri.ods = any (cy.ods_priorizados)
         where a.rol = 'principal'
           and coalesce((select r.estado from public.ranking_responses r where r.ciclo = a.ciclo and r.indicador = a.indicador and r.unidad = a.unidad), 'none') in ('none', 'draft', 'back')
         group by a.ciclo, a.unidad, cy.fecha_limite, cf.recordatorio_dias
      ) s
     where ((s.fecha - v_hoy) = any (s.recordatorio_dias) or ((s.fecha - v_hoy) < 0 and extract(isodow from v_hoy) = 1))
  loop
    for y in select d from public.thi_destinatarios_unidad(x.unidad) d loop
      insert into public.thi_notificaciones (ciclo_id, destinatario, plantilla, valores, clave_unica)
      values (x.ciclo, y.d, 'c-thi-recordatorio',
              jsonb_build_object('lista', left(x.lista, 1500), 'cantidad', case when x.cantidad = 1 then '1 indicador' else x.cantidad || ' indicadores' end,
                                 'fecha_limite', public.ugm_fecha_larga(x.fecha), 'dias', public.ugm_dias_frase(x.fecha - v_hoy),
                                 'oficina', left(coalesce((select u.name from public.units u where u.id = x.unidad), ''), 160),
                                 'ruta', '/admin/reporte-rankings?oficina=' || x.unidad),
              'rec:' || x.ciclo || ':' || y.d || ':' || x.unidad || ':' || v_hoy)
      on conflict (clave_unica) where clave_unica is not null do nothing
      returning id into v_id;
      if v_id is not null then v_n := v_n + 1; end if;
      v_id := null;
    end loop;
  end loop;
  return v_n;
end;
$$;

/** Prepara el resumen semanal para quien administra, el día configurado de cada ciclo abierto. */
create or replace function public.thi_programar_resumen(p_hoy date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := coalesce(p_hoy, public.ugm_hoy());
  cy record;
  x record;
  v_lista text;
  v_n int := 0;
  v_id uuid;
begin
  if auth.uid() is not null and not public.thi_es_admin() then
    raise exception 'Solo la administración del ranking prepara el resumen.' using errcode = '42501';
  end if;
  for cy in
    select c.id, c.ods_priorizados, c.fecha_limite from public.ranking_cycles c join public.thi_config cf on cf.ciclo_id = c.id
     where c.ranking = 'the-impact' and c.estado = 'abierto' and cf.avisos_activos and cf.resumen_semanal and cf.resumen_dia = extract(isodow from v_hoy)
  loop
    select concat_ws('; ',
             nullif(count(*) filter (where s.e = 'none'), 0) || ' sin empezar',
             nullif(count(*) filter (where s.e = 'draft'), 0) || ' en borrador',
             nullif(count(*) filter (where s.e = 'sent'), 0) || ' esperando revisión',
             nullif(count(*) filter (where s.e = 'back'), 0) || ' devueltos',
             count(*) filter (where s.e = 'ok') || ' aprobados de ' || count(*),
             nullif((select count(*) from public.thi_publicaciones p where p.ciclo_id = cy.id and p.lista), 0) || ' listos para la entrega',
             case when cy.fecha_limite < v_hoy then 'la fecha límite ya pasó' else null end)
      into v_lista
      from (
        select coalesce(r.estado, 'none') as e
          from public.ranking_indicators ri
          join public.ranking_assignments a on a.ciclo = ri.ciclo and a.indicador = ri.id and a.rol = 'principal'
          left join public.ranking_responses r on r.ciclo = a.ciclo and r.indicador = a.indicador and r.unidad = a.unidad
         where ri.ciclo = cy.id and ri.nivel = 'indicator' and ri.ods = any (cy.ods_priorizados)
      ) s;
    for x in select d from public.thi_destinatarios_admin(cy.id) d loop
      insert into public.thi_notificaciones (ciclo_id, destinatario, plantilla, valores, clave_unica)
      values (cy.id, x.d, 'c-thi-resumen', jsonb_build_object('lista', left(coalesce(v_lista, 'sin indicadores asignados'), 1500), 'ruta', '/admin/rankings/impact'),
              'res:' || cy.id || ':' || x.d || ':' || date_trunc('week', v_hoy::timestamp)::date)
      on conflict (clave_unica) where clave_unica is not null do nothing
      returning id into v_id;
      if v_id is not null then v_n := v_n + 1; end if;
      v_id := null;
    end loop;
  end loop;
  return v_n;
end;
$$;

/** Las dos tareas diarias en una: recordatorios y resumen. Es lo que se programa. */
create or replace function public.thi_tareas_diarias()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.thi_es_admin() then
    raise exception 'Solo la administración del ranking ejecuta las tareas.' using errcode = '42501';
  end if;
  return jsonb_build_object('recordatorios', public.thi_programar_recordatorios(), 'resumen', public.thi_programar_resumen());
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. La cola: tomar un lote, anotar el resultado, ver el estado
-- -----------------------------------------------------------------------------

/** Solo el rol de servicio (la función `correos`). Toma hasta p_limite correos y los marca «enviando». */
create or replace function public.thi_cola_tomar(p_limite int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de correos toma la cola.' using errcode = '42501';
  end if;
  update public.thi_notificaciones set estado = case when intentos >= 3 then 'error' else 'en_cola' end,
         error = case when intentos >= 3 then 'Se cortó el envío varias veces.' else error end
   where estado = 'enviando' and created_at < now() - interval '15 minutes' and programada_para < now() - interval '15 minutes';
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from (
    select n.id from public.thi_notificaciones n
     where n.estado = 'en_cola' and n.programada_para <= now()
     order by n.programada_para, n.created_at
     limit greatest(1, least(coalesce(p_limite, 20), 50))
     for update skip locked
  ) s;
  update public.thi_notificaciones set estado = 'enviando', intentos = intentos + 1, programada_para = now() where id = any (v_ids);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', n.id, 'plantilla', n.plantilla, 'valores', n.valores, 'correo', pr.email, 'nombre', pr.full_name, 'intentos', n.intentos))
      from public.thi_notificaciones n join public.profiles pr on pr.id = n.destinatario
     where n.id = any (v_ids) and pr.is_active
  ), '[]'::jsonb);
end;
$$;

/** Solo el rol de servicio. p_estado: enviado | error | omitido | reintentar (en 10 minutos) | liberar (vuelve a la cola sin gastar un intento). */
create or replace function public.thi_cola_resultado(p_id uuid, p_estado text, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n public.thi_notificaciones;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo la función de correos anota resultados.' using errcode = '42501';
  end if;
  select * into n from public.thi_notificaciones where id = p_id;
  if not found then return; end if;
  if p_estado = 'enviado' then
    update public.thi_notificaciones set estado = 'enviado', enviado_at = now(), error = null where id = p_id;
  elsif p_estado = 'omitido' then
    update public.thi_notificaciones set estado = 'omitido', error = left(p_error, 300) where id = p_id;
  elsif p_estado = 'liberar' then
    update public.thi_notificaciones set estado = 'en_cola', intentos = greatest(n.intentos - 1, 0), programada_para = now() where id = p_id and estado = 'enviando';
  elsif p_estado = 'reintentar' and n.intentos < 3 then
    update public.thi_notificaciones set estado = 'en_cola', programada_para = now() + interval '10 minutes', error = left(p_error, 300) where id = p_id;
  else
    update public.thi_notificaciones set estado = 'error', error = left(p_error, 300) where id = p_id;
  end if;
end;
$$;

/** Los destinatarios que no están activos no tienen correo que tomar: se dan por omitidos. */
create or replace function public.thi_cola_limpiar()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Solo el rol de servicio limpia la cola.' using errcode = '42501';
  end if;
  update public.thi_notificaciones n set estado = 'omitido', error = 'La persona está desactivada.'
   where n.estado in ('en_cola', 'enviando') and not exists (select 1 from public.profiles pr where pr.id = n.destinatario and pr.is_active);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/** Para el panel de la administración: conteos y últimos errores (sin el contenido de los correos). */
create or replace function public.thi_cola_estado(p_ciclo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.thi_exige_admin();
  return jsonb_build_object(
    'conteo', coalesce((select jsonb_object_agg(estado, n) from (select estado, count(*)::int as n from public.thi_notificaciones where (p_ciclo is null or ciclo_id = p_ciclo) group by estado) c), '{}'::jsonb),
    'errores', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'plantilla', n.plantilla, 'error', n.error, 'intentos', n.intentos, 'creado', n.created_at) order by n.created_at desc)
                          from (select * from public.thi_notificaciones where estado = 'error' and (p_ciclo is null or ciclo_id = p_ciclo) order by created_at desc limit 20) n), '[]'::jsonb),
    'ultimo_envio', (select max(enviado_at) from public.thi_notificaciones where estado = 'enviado' and (p_ciclo is null or ciclo_id = p_ciclo)));
end;
$$;

create or replace function public.thi_cola_reintentar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.thi_exige_admin();
  update public.thi_notificaciones set estado = 'en_cola', intentos = 0, programada_para = now(), error = null where id = p_id and estado in ('error', 'omitido');
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Permisos de ejecución
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['thi_programar_recordatorios(date)', 'thi_programar_resumen(date)', 'thi_tareas_diarias()', 'thi_cola_estado(uuid)', 'thi_cola_reintentar(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['thi_cola_tomar(int)', 'thi_cola_resultado(uuid, text, text)', 'thi_cola_limpiar()',
                           'thi_encolar_asignacion(uuid, text, uuid, text)', 'thi_encolar_estado(public.ranking_responses, public.ranking_responses)',
                           'thi_etiqueta(uuid, text)', 'thi_pregunta(uuid, text)', 'thi_ods_etiqueta(uuid, text)',
                           'thi_destinatarios_unidad(uuid)', 'thi_destinatarios_admin(uuid)', 'thi_avisa(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- CÓMO PROGRAMARLO (NO se activa en esta migración; lo decide y lo hace el usuario)
--
-- Igual que 0213 (UI GreenMetric): elija pg_cron o el cron de Coolify. Puede añadir estas
-- dos tareas a las que ya tenga para UI GreenMetric.
--
--   -- pg_cron: cada día a las 7:00 de Bogotá (12:00 UTC) y cada 5 minutos la cola.
--   select cron.schedule('thi-tareas-diarias', '0 12 * * *', $$ select public.thi_tareas_diarias(); $$);
--   select cron.schedule('thi-cola-correos', '*/5 * * * *', $$
--     select net.http_post(
--       url := 'https://<su-dominio>/functions/v1/correos',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <SERVICE_ROLE_KEY>'),
--       body := jsonb_build_object('action', 'thi_cola', 'limite', 20)
--     );
--   $$);
--
--   -- Coolify (sin pg_cron): cada 5 minutos
--   --   curl -s -X POST https://<su-dominio>/functions/v1/correos -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
--   --        -H "Content-Type: application/json" -d '{"action":"thi_cola","limite":20}'
--   -- y una vez al día
--   --   curl -s -X POST https://<su-dominio>/rest/v1/rpc/thi_tareas_diarias -H "apikey: $SERVICE_ROLE_KEY" \
--   --        -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}'
--
-- Sin programar nada, la cola avanza cuando alguien de Planeación pulsa «Enviar avisos
-- pendientes» en la sección Avisos y bitácora (acción thi_cola con su sesión); los
-- recordatorios y el resumen sí necesitan la tarea diaria o el botón «Preparar recordatorios».
-- =============================================================================
