/* =============================================================================
   Estación 4 · La oficina.

   Lo que no es ni foto ni persona: el propósito que cierra la portada, el
   contacto que se repite en el pie y en /equipo, las áreas —que además son la
   lista de la que cuelga cada persona— y los cuatro accesos del cierre.

   Un área no se borra a la ligera: si alguien está asignado a ella, se dice
   cuántos se quedan sin área antes de confirmar, y se les quita la asignación
   en el mismo movimiento para no dejar referencias colgando.
   ========================================================================== */

import { Icon } from "../../../../components/ui/Icon";
import { uid } from "../../../planeacion/page";
import type { OfficeAreaItem, OfficeLinkItem } from "../../../planeacion/page";
import { ConfirmButton, Panel, slugify } from "../../udes-en-cifras/ui";
import { Text } from "../fields";
import type { OfficeStationProps } from "../OfficePageAdmin";

export function OfficeStation({ draft, patch, canEdit }: OfficeStationProps) {
  const setAreas = (areas: OfficeAreaItem[]) => patch((page) => ({ ...page, areas }));
  const setLinks = (links: OfficeLinkItem[]) => patch((page) => ({ ...page, links }));

  const moveIn = <T,>(rows: T[], index: number, step: -1 | 1): T[] => {
    const target = index + step;
    if (target < 0 || target >= rows.length) return rows;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  };

  function removeArea(area: OfficeAreaItem) {
    patch((page) => ({
      ...page,
      areas: page.areas.filter((item) => item.id !== area.id),
      team: {
        ...page.team,
        people: page.team.people.map((person) =>
          person.area === area.id ? { ...person, area: "" } : person,
        ),
      },
    }));
  }

  return (
    <>
      <Panel
        title="La oficina"
        description="El propósito cierra la portada y encabeza /equipo. El contacto se repite en el pie de todas las páginas del portal."
      >
        <div className="oda-form-grid">
          <Text
            label="Nombre de la oficina"
            value={draft.office.name}
            disabled={!canEdit}
            onChange={(name) => patch((page) => ({ ...page, office: { ...page.office, name } }))}
          />
          <Text
            label="Universidad"
            value={draft.office.university}
            disabled={!canEdit}
            onChange={(university) => patch((page) => ({ ...page, office: { ...page.office, university } }))}
          />
          <Text
            label="Propósito"
            wide
            rows={4}
            comfortable={300}
            value={draft.office.purpose}
            disabled={!canEdit}
            onChange={(purpose) => patch((page) => ({ ...page, office: { ...page.office, purpose } }))}
            hint="Qué hace la oficina, en una frase larga. Se lee dos veces: en la portada y en /equipo."
          />
          <Text
            label="Correo"
            type="email"
            value={draft.office.email}
            disabled={!canEdit}
            placeholder="planeacion@udes.edu.co"
            onChange={(email) => patch((page) => ({ ...page, office: { ...page.office, email } }))}
          />
          <Text
            label="Teléfono"
            type="tel"
            value={draft.office.phone}
            disabled={!canEdit}
            placeholder="+57 607 651 6500"
            onChange={(phone) => patch((page) => ({ ...page, office: { ...page.office, phone } }))}
            hint="Vacío no se muestra."
          />
          <Text
            label="Dirección"
            wide
            value={draft.office.address}
            disabled={!canEdit}
            placeholder="Campus Universitario Lagos del Cacique, Bucaramanga"
            onChange={(address) => patch((page) => ({ ...page, office: { ...page.office, address } }))}
            hint="Vacía no se muestra."
          />
        </div>
      </Panel>

      <Panel
        title="Áreas"
        description="Qué hace la oficina, área por área. Son también la lista de la que cuelga cada persona del equipo."
        actions={
          canEdit && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setAreas([...draft.areas, { id: uid(), name: "", does: "", to: "", toLabel: "" }])}
            >
              <Icon name="plus" size={15} /> Añadir un área
            </button>
          )
        }
      >
        {draft.areas.length === 0 ? (
          <p className="oda-muted">
            Sin áreas, /equipo no dibuja su sección «Qué hacemos» y las personas del equipo se publican sin
            etiqueta de área.
          </p>
        ) : (
          <ol className="ofa-rows ofa-rows--compact">
            {draft.areas.map((area, index) => {
              const assigned = draft.team.people.filter((person) => person.area === area.id).length;
              return (
                <li key={area.id} className="ofa-row">
                  <div className="ofa-row__fields oda-form-grid">
                    <Text
                      label="Nombre"
                      value={area.name}
                      disabled={!canEdit}
                      placeholder="Estadística institucional"
                      onChange={(name) =>
                        setAreas(
                          draft.areas.map((item) =>
                            item.id === area.id
                              ? { ...item, name, id: item.id || slugify(name) || uid() }
                              : item,
                          ),
                        )
                      }
                    />
                    <Text
                      label="Qué hace"
                      wide
                      rows={2}
                      comfortable={170}
                      value={area.does}
                      disabled={!canEdit}
                      placeholder="Recibe las cifras que reporta cada oficina, las valida y las publica."
                      onChange={(does) =>
                        setAreas(draft.areas.map((item) => (item.id === area.id ? { ...item, does } : item)))
                      }
                    />
                    <Text
                      label="Dónde se ve su trabajo"
                      value={area.to}
                      disabled={!canEdit}
                      placeholder="/datos-abiertos"
                      onChange={(to) =>
                        setAreas(draft.areas.map((item) => (item.id === area.id ? { ...item, to } : item)))
                      }
                    />
                    <Text
                      label="Rótulo del enlace"
                      value={area.toLabel}
                      disabled={!canEdit || !area.to}
                      placeholder="UDES en Cifras"
                      onChange={(toLabel) =>
                        setAreas(draft.areas.map((item) => (item.id === area.id ? { ...item, toLabel } : item)))
                      }
                    />
                  </div>

                  {canEdit && (
                    <div className="ofa-row__actions">
                      <button
                        type="button"
                        className="icon-button"
                        disabled={index === 0}
                        onClick={() => setAreas(moveIn(draft.areas, index, -1))}
                        aria-label={`Subir ${area.name || "el área"}`}
                        title="Subir"
                      >
                        <Icon name="arrow-left" size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        disabled={index === draft.areas.length - 1}
                        onClick={() => setAreas(moveIn(draft.areas, index, 1))}
                        aria-label={`Bajar ${area.name || "el área"}`}
                        title="Bajar"
                      >
                        <Icon name="arrow-right" size={15} />
                      </button>
                      <ConfirmButton
                        label="Quitar"
                        confirmLabel={
                          assigned
                            ? `${assigned === 1 ? "Una persona se queda" : `${assigned} personas se quedan`} sin área.`
                            : "El área desaparece de /equipo."
                        }
                        onConfirm={() => removeArea(area)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      <Panel
        title="El cierre de la portada"
        description="El titular con el que termina la portada y la columna de enlaces que lo acompaña. Solo destinos que existan en el sitio."
        actions={
          canEdit && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => setLinks([...draft.links, { id: uid(), label: "", hint: "", to: "" }])}
            >
              <Icon name="plus" size={15} /> Añadir un acceso
            </button>
          )
        }
      >
        <div className="oda-form-grid">
          <Text
            label="Titular del cierre"
            wide
            rows={2}
            comfortable={60}
            value={draft.home.closingTitle}
            disabled={!canEdit}
            placeholder="Planear con datos, rendir cuentas con ellos."
            onChange={(closingTitle) => patch((page) => ({ ...page, home: { ...page.home, closingTitle } }))}
            hint="Cierra la portada, sobre el propósito. Es la frase que resume a qué se dedica la oficina."
          />
        </div>

        {draft.links.length === 0 ? (
          <p className="oda-muted">Sin accesos, el cierre de la portada queda solo con el titular y el propósito.</p>
        ) : (
          <ol className="ofa-rows ofa-rows--compact">
            {draft.links.map((item, index) => (
              <li key={item.id} className="ofa-row">
                <div className="ofa-row__fields oda-form-grid">
                  <Text
                    label="Rótulo"
                    value={item.label}
                    disabled={!canEdit}
                    placeholder="Repositorio documental"
                    onChange={(label) =>
                      setLinks(draft.links.map((row) => (row.id === item.id ? { ...row, label } : row)))
                    }
                  />
                  <Text
                    label="Pista"
                    value={item.hint}
                    disabled={!canEdit}
                    placeholder="Documentos del plan"
                    onChange={(hint) =>
                      setLinks(draft.links.map((row) => (row.id === item.id ? { ...row, hint } : row)))
                    }
                  />
                  <Text
                    label="Destino"
                    value={item.to}
                    disabled={!canEdit}
                    placeholder="/implementacion#repositorio"
                    onChange={(to) =>
                      setLinks(draft.links.map((row) => (row.id === item.id ? { ...row, to } : row)))
                    }
                  />
                </div>
                {canEdit && (
                  <div className="ofa-row__actions">
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => setLinks(moveIn(draft.links, index, -1))}
                      aria-label={`Subir ${item.label || "el acceso"}`}
                      title="Subir"
                    >
                      <Icon name="arrow-left" size={15} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      disabled={index === draft.links.length - 1}
                      onClick={() => setLinks(moveIn(draft.links, index, 1))}
                      aria-label={`Bajar ${item.label || "el acceso"}`}
                      title="Bajar"
                    >
                      <Icon name="arrow-right" size={15} />
                    </button>
                    <ConfirmButton
                      label="Quitar"
                      confirmLabel="El acceso desaparece de la portada."
                      onConfirm={() => setLinks(draft.links.filter((row) => row.id !== item.id))}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel
        title="La página del equipo"
        description="Los textos propios de /equipo: su encabezado y el bloque de contacto del final."
        tone="quiet"
      >
        <div className="oda-form-grid">
          <Text
            label="Título"
            comfortable={40}
            value={draft.teamPage.title}
            disabled={!canEdit}
            placeholder="La oficina"
            onChange={(title) => patch((page) => ({ ...page, teamPage: { ...page.teamPage, title } }))}
          />
          <Text
            label="Título del contacto"
            comfortable={40}
            value={draft.teamPage.contactTitle}
            disabled={!canEdit}
            placeholder="Escríbenos"
            onChange={(contactTitle) =>
              patch((page) => ({ ...page, teamPage: { ...page.teamPage, contactTitle } }))
            }
          />
          <Text
            label="Entradilla"
            wide
            rows={3}
            comfortable={300}
            value={draft.teamPage.lede}
            disabled={!canEdit}
            onChange={(lede) => patch((page) => ({ ...page, teamPage: { ...page.teamPage, lede } }))}
          />
          <Text
            label="Texto del contacto"
            wide
            rows={3}
            comfortable={260}
            value={draft.teamPage.contactBody}
            disabled={!canEdit}
            onChange={(contactBody) =>
              patch((page) => ({ ...page, teamPage: { ...page.teamPage, contactBody } }))
            }
          />
        </div>
      </Panel>
    </>
  );
}
