/** Seta "FLUXO DE AR" — corpo preto sólido; viewBox largo para o texto não cortar. */
export function FluxoDeArSeta({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 42"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      role="img"
      shapeRendering="geometricPrecision"
      preserveAspectRatio="xMidYMid meet"
    >
      <polygon points="8,0 16,11 0,11" fill="#000" />
      <rect x="0" y="11" width="16" height="31" fill="#000" />
      <text
        x="8"
        y="27"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="3.25"
        fontWeight="900"
        letterSpacing="0.04em"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(-90 8 27)"
      >
        FLUXO DE AR
      </text>
    </svg>
  );
}

/** Logo HEPA P&B recortado (filtro + AIR FLOW + Filtros Industriais). v2 jun/2026 */
export const HEPA_LOGO_ETIQUETA_SRC = "/etiquetas/hepa-logo-bw-top.png?v=2";
