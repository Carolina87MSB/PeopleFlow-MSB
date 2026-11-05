-- ════════════════════════════════════════════════════════════════════════
-- Reversão: Gestor autorizado + solicitação de habilitação (supabase/desenvolvimento_solicitacao_habilitacao.sql)
-- ════════════════════════════════════════════════════════════════════════
-- Devolve a função de leitura à definição anterior (modelo de habilitação) e remove a tabela de solicitações.
-- Recusa-se (nada é alterado) se já existir solicitação registrada: é rastreabilidade que nunca é apagada.
-- ORDEM: se o código novo já estiver publicado, reverta primeiro o código (ele depende da tabela).
-- Transacional e repetível.
-- ════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
  if to_regclass('public.peopleflow_dev_habilitacao_solicitacoes') is not null then
    if exists (select 1 from public.peopleflow_dev_habilitacao_solicitacoes) then
      raise exception 'Reversão bloqueada: existem solicitações de habilitação registradas (histórico não é apagado).';
    end if;
  end if;
end $$;

-- 1. Função de leitura: definição anterior (supabase/desenvolvimento_habilitacao_responsaveis.sql)
create or replace function public.peopleflow_dev_gere_treinamento(p_treinamento_id bigint)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.peopleflow_dev_meu_perfil()
    when 'RH' then true
    when 'Gestor' then public.peopleflow_dev_responsavel_por(p_treinamento_id) or exists (
      select 1 from public.peopleflow_dev_treinamentos t
      where t.id = p_treinamento_id
        and public.peopleflow_dev_meu_colaborador_id() is not null
        and (t.solicitado_por_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
             or exists (select 1 from public.peopleflow_dev_escopo e
                        where e.gestor_colaborador_id = public.peopleflow_dev_meu_colaborador_id()
                          and e.colaborador_id = t.solicitado_por_colaborador_id)))
    when 'Responsavel' then public.peopleflow_dev_habilitado_agora() and public.peopleflow_dev_responsavel_por(p_treinamento_id)
    else false end
$$;
revoke all on function public.peopleflow_dev_gere_treinamento(bigint) from public, anon;
grant execute on function public.peopleflow_dev_gere_treinamento(bigint) to authenticated, service_role;

-- 2. Solicitações (vazia, conferido acima)
drop table if exists public.peopleflow_dev_habilitacao_solicitacoes;
drop function if exists public.peopleflow_dev_hab_solic_regras();

notify pgrst, 'reload schema';

commit;
