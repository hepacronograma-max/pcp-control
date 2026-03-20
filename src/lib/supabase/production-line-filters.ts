/**
 * Filtro PostgREST para listar linhas “ativas”.
 * `.eq("is_active", true)` exclui `NULL` — comum em bancos onde a coluna
 * foi adicionada depois sem UPDATE nos registros antigos.
 */
export const PRODUCTION_LINES_ACTIVE_OR =
  "is_active.is.null,is_active.eq.true" as const;
