// Situação funcional de linhas cruas de `colaboradores` no SERVIDOR — usa a MESMA regra central do front e do SQL
// (src/domain/situacaoFuncional.ts). Nada aqui decide regra: só adapta o formato (colunas snake_case do banco).

import { dadosFuncionaisDeLinha, estaAtivoHoje, type EscopoSituacao } from "../../src/domain/situacaoFuncional.js";
import { emailOf } from "../../src/domain/hierarquia.js";

/** Colunas que toda consulta precisa trazer para decidir a situação de uma linha. */
export const COLUNAS_SITUACAO = "desligado, data_desligamento, admissao, empresa_afiliada";

export interface LinhaSituacao {
  desligado?: boolean | null;
  data_desligamento?: string | null;
  admissao?: string | null;
  empresa_afiliada?: boolean | null;
}

/**
 * A linha está ativa HOJE? Escopo "acesso" (padrão) = como o servidor sempre tratou: desligado não entra, afiliada continua entrando
 * (usa o portal) e admissão futura/ausente não bloqueia. Diferença para o antigo `!desligado`: desligamento com data FUTURA ainda conta
 * como ativo até o dia, e desligado sem data conta como desligado.
 */
export function linhaAtiva(linha: LinhaSituacao, escopo: Exclude<EscopoSituacao, "quadro"> = "acesso", hoje?: string): boolean {
  return estaAtivoHoje(dadosFuncionaisDeLinha(linha), escopo, hoje);
}

/**
 * O e-mail pertence a colaborador(es) do cadastro e NENHUM está ativo? (conta de quem já saiu). E-mail que não bate com ninguém do
 * cadastro NÃO é bloqueado (externos, contas técnicas): só se bloqueia o que o cadastro prova que é de desligado.
 */
export function emailDeColaboradorDesligado(email: string, linhas: ({ nome: string } & LinhaSituacao)[], hoje?: string): boolean {
  const alvo = email.toLowerCase();
  const donos = linhas.filter((l) => emailOf(l.nome).toLowerCase() === alvo);
  return donos.length > 0 && !donos.some((l) => linhaAtiva(l, "acesso", hoje));
}

/** Banco mínimo usado pelo localizador por nome (permite teste com banco falso). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BancoColaboradores = { from: (tabela: string) => any };

export type AlvoPorNome = { ok: true; ids: number[] } | { ok: false; status: number; error: string };

/**
 * Localiza o(s) registro(s) a atualizar a partir do NOME (várias telas ainda identificam pessoa por nome). Um único registro com o nome vale
 * sempre. Com homônimos, vale só o ATIVO (o desligado nunca é tocado por engano); se ainda houver mais de um ativo com o mesmo nome, recusa.
 */
export async function alvoPorNome(db: BancoColaboradores, nome: string, hoje?: string): Promise<AlvoPorNome> {
  const { data, error } = await db.from("colaboradores").select(`id, ${COLUNAS_SITUACAO}`).eq("nome", nome);
  if (error) return { ok: false, status: 500, error: error.message };
  const linhas = (data ?? []) as ({ id: number } & LinhaSituacao)[];
  if (linhas.length === 0) return { ok: false, status: 404, error: `Colaborador "${nome}" não encontrado.` };
  if (linhas.length === 1) return { ok: true, ids: [Number(linhas[0].id)] };
  const ativos = linhas.filter((l) => linhaAtiva(l, "acesso", hoje));
  if (ativos.length === 1) return { ok: true, ids: [Number(ativos[0].id)] };
  return { ok: false, status: 409, error: `Há mais de um registro com o nome "${nome}" no cadastro; a atualização foi recusada para não alterar a pessoa errada.` };
}
