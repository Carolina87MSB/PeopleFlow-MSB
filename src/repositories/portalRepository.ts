import tiposSeed from "../data/tiposMovimentacao.json";
import perfisSeed from "../data/perfis.json";
import type { Perfil2Info, TipoMovimentacao } from "../types/domain";

/**
 * Catálogos estáticos e não-sensíveis (tipos de movimentação, perfis de
 * acesso) — não mudam por empresa nem precisam de banco. Colaboradores,
 * movimentações e cargos personalizados vêm do Supabase (ver
 * colaboradoresRepository.ts, movimentacoesRepository.ts e
 * cargosCustomRepository.ts).
 */
export async function getTiposMovimentacao(): Promise<TipoMovimentacao[]> {
  return tiposSeed as TipoMovimentacao[];
}

export async function getPerfis(): Promise<Perfil2Info[]> {
  return perfisSeed as Perfil2Info[];
}
