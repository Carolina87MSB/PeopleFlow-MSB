import colaboradoresSeed from "../data/colaboradores.json";
import movimentacoesSeed from "../data/movimentacoes.json";
import tiposSeed from "../data/tiposMovimentacao.json";
import perfisSeed from "../data/perfis.json";
import type { Colaborador, Movimentacao, Perfil2Info, TipoMovimentacao } from "../types/domain";

/**
 * Single seam between the app and its data source. Everything here reads static
 * seed JSON today; swapping to a real API/DB later means changing only this file.
 */
export async function getColaboradores(): Promise<Colaborador[]> {
  return colaboradoresSeed as Colaborador[];
}

export async function getMovimentacoesSeed(): Promise<Movimentacao[]> {
  return movimentacoesSeed as Movimentacao[];
}

export async function getTiposMovimentacao(): Promise<TipoMovimentacao[]> {
  return tiposSeed as TipoMovimentacao[];
}

export async function getPerfis(): Promise<Perfil2Info[]> {
  return perfisSeed as Perfil2Info[];
}
