/** Coluna direita: seta para cima + faixa preta com "FLUXO" / "DE AR" legível na térmica. */
export function FluxoDeArSeta({ className = "" }: { className?: string }) {
  return (
    <div className={`etiqueta-filtro__fluxo-bar ${className}`.trim()} aria-hidden>
      <svg
        className="etiqueta-filtro__fluxo-arrow"
        viewBox="0 0 26 11"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMax meet"
      >
        <polygon points="13,0 26,11 0,11" fill="#000" />
      </svg>
      <div className="etiqueta-filtro__fluxo-body">
        <span className="etiqueta-filtro__fluxo-line">FLUXO</span>
        <span className="etiqueta-filtro__fluxo-line">DE AR</span>
      </div>
    </div>
  );
}

/**
 * Logo P&B recortado (filtro + AIR FLOW + Filtros Industriais).
 * Arquivo físico: public/etiquetas/hepa-logo-bw-top.png
 * Após substituir o PNG manualmente, incremente LOGO_CACHE_VERSION e faça deploy.
 */
export const LOGO_CACHE_VERSION = 4;
export const HEPA_LOGO_ETIQUETA_SRC = `/etiquetas/hepa-logo-bw-top.png?v=${LOGO_CACHE_VERSION}`;
