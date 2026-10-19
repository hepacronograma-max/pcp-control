# SQL legado (histórico)

Estes arquivos ficavam soltos na raiz do projeto (`supabase-*.sql`) e foram
executados manualmente no SQL Editor ao longo de 2026, conforme cada módulo
foi criado. Ficam aqui **apenas como histórico** do schema.

⚠️ **Não execute estes arquivos de novo em produção.** Vários deles criam
políticas RLS abertas (`USING (true)` sem `TO authenticated`), que foram
fechadas em 19/10/2026 pela migration
[`../migrations/20261019_rls_authenticated.sql`](../migrations/20261019_rls_authenticated.sql).

Mudanças novas de banco vão em `supabase/migrations/AAAAMMDD_descricao.sql`,
sempre com `TO authenticated` nas policies.
