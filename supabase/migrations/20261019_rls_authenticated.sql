-- =============================================================================
-- 2026-10-19 — Fechamento do RLS (aplicado manualmente em produção nesta data)
--
-- Contexto: as políticas criadas pelos SQLs antigos (supabase/legacy/*.sql)
-- usavam `USING (true)` sem `TO authenticated`, ou seja, liberavam leitura e
-- escrita para QUALQUER pessoa com a chave pública (anon). A tabela `profiles`
-- estava com RLS desligado.
--
-- Este arquivo registra a correção no repositório. É idempotente: pode ser
-- executado de novo sem efeito colateral.
--
-- Regras resultantes:
--   * Todas as políticas `public` passam a valer só para usuários logados.
--   * `profiles`: cada usuário vê os perfis da própria empresa e edita só o
--     próprio; o navegador NÃO pode alterar role, extra_roles, company_id,
--     is_active (isso é feito pelo servidor com service role).
--
-- IMPORTANTE: ao criar tabela nova, sempre use `TO authenticated` na policy.
-- =============================================================================

begin;

-- 1) Políticas abertas ao público -> apenas usuários autenticados
do $$
declare r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public' and roles = '{public}'
  loop
    execute format('alter policy %I on public.%I to authenticated',
                   r.policyname, r.tablename);
  end loop;
end $$;

-- 2) Empresa do usuário logado (security definer evita recursão no RLS)
do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t
  from pg_attribute
  where attrelid = 'public.profiles'::regclass and attname = 'company_id';
  execute format($f$
    create or replace function public.current_company_id()
    returns %s language sql stable security definer
    set search_path = public as
    'select company_id from public.profiles where id = auth.uid()'
  $f$, t);
end $$;

-- 3) Trava: pelo navegador ninguém altera papel, empresa ou status
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (to_jsonb(new)->'role')        is distinct from (to_jsonb(old)->'role')
    or (to_jsonb(new)->'extra_roles') is distinct from (to_jsonb(old)->'extra_roles')
    or (to_jsonb(new)->'company_id')  is distinct from (to_jsonb(old)->'company_id')
    or (to_jsonb(new)->'is_active')   is distinct from (to_jsonb(old)->'is_active')
    or new.id is distinct from old.id then
      raise exception 'Alteração de permissões não autorizada';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile_privileges on public.profiles;
create trigger trg_protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- 4) RLS em profiles
alter table public.profiles enable row level security;

drop policy if exists profiles_select_same_company on public.profiles;
create policy profiles_select_same_company on public.profiles
  for select to authenticated
  using (id = auth.uid() or company_id = public.current_company_id());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

commit;

-- Verificação (esperado: true / 0 / 30 ou mais)
-- select
--   (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as profiles_rls,
--   (select count(*) from pg_policies where schemaname = 'public' and roles = '{public}') as regras_abertas,
--   (select count(*) from pg_policies where schemaname = 'public' and roles = '{authenticated}') as regras_logados;
