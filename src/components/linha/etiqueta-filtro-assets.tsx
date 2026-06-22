/** Seta "FLUXO DE AR" — preta sólida, texto branco centralizado no corpo. */
export function FluxoDeArSeta({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 10 42"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      role="img"
    >
      <polygon points="5,0 10,10 0,10" fill="#000" stroke="#000" strokeWidth="0.2" />
      <rect x="0.15" y="10" width="9.7" height="32" fill="#000" stroke="#000" strokeWidth="0.15" />
      <text
        x="5"
        y="26"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="3.45"
        fontWeight="900"
        letterSpacing="0.1em"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(-90 5 26)"
      >
        FLUXO DE AR
      </text>
    </svg>
  );
}

/** Logo original HEPA (colorido) — arquivo em public/etiquetas. */
export const HEPA_LOGO_ETIQUETA_SRC = "/etiquetas/hepa-logo-original.png";
