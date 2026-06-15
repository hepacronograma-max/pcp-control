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
      <polygon points="5,0 10,9 0,9" fill="#000" />
      <rect x="1.5" y="9" width="7" height="33" fill="#000" />
      <text
        x="5"
        y="25.5"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="3"
        fontWeight="700"
        letterSpacing="0.08em"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(-90 5 25.5)"
      >
        FLUXO DE AR
      </text>
    </svg>
  );
}

/** Logo original HEPA (colorido) — arquivo em public/etiquetas. */
export const HEPA_LOGO_ETIQUETA_SRC = "/etiquetas/hepa-logo-original.png";
