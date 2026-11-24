/* Flecha de los enlaces del portal ODS: un trazo de 1,75 px que hereda el color del texto. */
export function OdsPortalArrow({ dir = "right" }: { dir?: "right" | "left" }) {
  return (
    <svg className="opt-arrow" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false" style={dir === "left" ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M2.5 8h10.5M9 3.5 13.5 8 9 12.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
    </svg>
  );
}
