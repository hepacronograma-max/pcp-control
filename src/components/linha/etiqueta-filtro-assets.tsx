/** Seta "FLUXO DE AR" — corpo preto sólido, texto branco legível na térmica. */
export function FluxoDeArSeta({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 10 42"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      role="img"
      shapeRendering="crispEdges"
    >
      <polygon points="5,0 10,11 0,11" fill="#000" />
      <rect x="0" y="11" width="10" height="31" fill="#000" />
      <text
        x="5"
        y="26.5"
        fill="#fff"
        stroke="#fff"
        strokeWidth="0.08"
        paintOrder="stroke fill"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="3.85"
        fontWeight="900"
        letterSpacing="0.12em"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(-90 5 26.5)"
      >
        FLUXO DE AR
      </text>
    </svg>
  );
}

/** Logo original HEPA (colorido) — arquivo em public/etiquetas. */
export const HEPA_LOGO_ETIQUETA_SRC = "/etiquetas/hepa-logo-original.png";
