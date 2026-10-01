/* =============================================================================
   Mr. Pilo en Enseñanza · las piezas que se repiten en sus paneles.

   Thinking     Pilo pensando: su cara aprobada («pensar»), tres puntos y qué
                está haciendo; con avance conocido, una barra que lo sigue.
   Meter        un contador de hoy contra su tope, con la barra que crece.
   Skeleton     filas de espera con la forma de lo que va a llegar.
   TextArea     un texto con tope y su contador.
   RolTag       para quién: estudiante, profesor o sin rol.
   Soon         un panel anunciado que llega en la próxima entrega.
   useEnter     una lista que llega de la base entra una vez por llegada.
   ========================================================================== */

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { PiloFace } from "../../../components/pilo/PiloFace";
import { Icon } from "../../../components/ui/Icon";
import type { IconName } from "../../../components/ui/Icon";
import { Group, StatusMark } from "../pilo/ui";
import { enterList, fillBar, thinkingDots } from "./motion";

/** Pilo pensando. `progress` (0 a 1) solo cuando el avance se conoce de verdad. */
export function Thinking({ children, progress, detail }: { children: ReactNode; progress?: number; detail?: ReactNode }) {
  const dots = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => thinkingDots(dots.current ? [...dots.current.children] : []), []);

  useLayoutEffect(() => {
    if (progress === undefined) return;
    fillBar(bar.current, progress, started.current ? undefined : 0);
    started.current = true;
  }, [progress]);

  return (
    <div className="pen-think" role="status" aria-live="polite">
      <span className="pen-think__face">
        <PiloFace size={44} expression="pensar" alive />
      </span>
      <span className="pen-think__text">
        <strong>
          {children}
          <span className="pen-think__dots" ref={dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </strong>
        {detail && <small>{detail}</small>}
        {progress !== undefined && (
          <i className="pen-think__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <span ref={bar} />
          </i>
        )}
      </span>
    </div>
  );
}

/** Un contador de hoy contra su tope: el número, la barra y lo que pasa al llegar. */
export function Meter({ label, used, limit, unit, full }: { label: string; used: number; limit: number; unit: string; full: string }) {
  const bar = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const share = limit > 0 ? Math.min(1, used / limit) : 0;
  const high = limit === 0 ? used > 0 : share >= 0.9;

  useLayoutEffect(() => {
    fillBar(bar.current, share, started.current ? undefined : 0);
    started.current = true;
  }, [share]);

  return (
    <div className="pis-usage pen-meter">
      <div>
        <strong>
          {used.toLocaleString("es-CO")}{" "}
          <span>
            de {limit.toLocaleString("es-CO")} {unit}
          </span>
        </strong>
        <small>{limit === 0 ? <StatusMark tone="warn">{`Tope en 0. ${full}`}</StatusMark> : high ? <StatusMark tone="warn">{`Casi en el tope. ${full}`}</StatusMark> : "Se reinicia cada día."}</small>
      </div>
      <i role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used} aria-label={label}>
        <span ref={bar} data-high={high || undefined} />
      </i>
    </div>
  );
}

/** Filas de espera: dicen que algo está llegando y qué forma tendrá. */
export function Skeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div className="pen-skeleton" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Un texto con tope: el contador avisa antes de llegar. */
export function TextArea({
  label,
  hint,
  value,
  max,
  rows = 3,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: ReactNode;
  value: string;
  max: number;
  rows?: number;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  const left = max - value.length;
  return (
    <label className="pen-field">
      <span className="pen-field__label">
        {label}
        <small data-near={left <= max * 0.1 || undefined}>
          {value.length.toLocaleString("es-CO")} de {max.toLocaleString("es-CO")}
        </small>
      </span>
      <textarea rows={rows} maxLength={max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

const ROL_TEXT: Record<string, string> = { estudiante: "Estudiante", profesor: "Profesor" };

/** Para quién: con su palabra, no solo con un color. */
export function RolTag({ rol }: { rol: string | null | undefined }) {
  const key = rol === "estudiante" || rol === "profesor" ? rol : "";
  return (
    <span className="pen-rol" data-rol={key || "general"}>
      {ROL_TEXT[key] ?? "Sin rol"}
    </span>
  );
}

/** Un panel que todavía no existe: dice qué hará y cuándo llega, sin controles de mentira. */
export function Soon({ title, icon, children }: { title: string; icon: IconName; children: ReactNode }) {
  return (
    <Group title={title} aside={<span className="pen-soon__tag">Llega en la próxima entrega</span>}>
      <div className="pen-soon" role="note">
        <Icon name={icon} size={20} />
        <p>{children}</p>
      </div>
    </Group>
  );
}

/** La lista entra una vez cada vez que cambia `key` (los datos que llegaron), no en cada pintada. */
export function useEnter<T extends HTMLElement>(key: unknown): RefObject<T> {
  const ref = useRef<T>(null);
  const last = useRef<unknown>(undefined);
  useLayoutEffect(() => {
    if (key === undefined || key === null || key === last.current) return;
    last.current = key;
    if (ref.current) enterList([...ref.current.children]);
  }, [key]);
  return ref;
}
