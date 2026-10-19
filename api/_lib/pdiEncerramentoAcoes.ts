// Ação do servidor: ENCERRAR O PDI de colaborador DESLIGADO (status "Encerrado"). Usada só por api/desenvolvimento.ts (via ACOES de
// desenvolvimentoAcoes.ts).
//
// Regras:
//   • só o RH executa (a sessão e o perfil são validados no servidor antes daqui);
//   • só encerra PDI ainda aberto ("Não iniciado" / "Em andamento") de colaborador que o CADASTRO prova ter saído (nenhum registro ativo com o
//     mesmo nome); "Concluído" e "Encerrado" não são encerrados de novo;
//   • grava SOMENTE o cabeçalho do PDI (status, data, responsável e motivo do encerramento). Itens, ações, evidências, sugestões e histórico
//     não são tocados — as ações NÃO são concluídas nem canceladas;
//   • o plano encerrado é imutável (trigger no banco: supabase/pdi_encerramento.sql);
//   • registra a auditoria em peopleflow_dev_auditoria (antes/depois e fotografia do que foi preservado).

import { supabaseAdmin } from "./adminAuth.js";
import type { ContaDev } from "./desenvolvimentoAcoes.js";
import { ErroLnt } from "./lntAcoes.js";
import { COLUNAS_SITUACAO, linhaAtiva } from "./situacaoColaboradores.js";

type Corpo = Record<string, unknown>;

function erroBanco(error: { message: string }, rotulo: string): never {
  throw new ErroLnt(500, `${rotulo}: ${error.message}`);
}

async function pdiEncerrar(conta: ContaDev, corpo: Corpo) {
  if (conta.perfil !== "RH") throw new ErroLnt(403, "Somente o RH pode encerrar um PDI.");
  const pdiId = Number(corpo.pdi_id);
  if (!Number.isInteger(pdiId) || pdiId <= 0) throw new ErroLnt(422, "PDI inválido.");
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
  if (!motivo) throw new ErroLnt(422, "Informe o motivo do encerramento.");
  if (motivo.length > 1000) throw new ErroLnt(422, "O motivo excede 1000 caracteres.");

  const { data: pdi, error } = await supabaseAdmin.from("peopleflow_pdi").select("id, colaborador_nome, ciclo, status").eq("id", pdiId).maybeSingle();
  if (error) erroBanco(error, "PDI");
  if (!pdi) throw new ErroLnt(404, "PDI não encontrado.");
  if (pdi.status === "Encerrado") throw new ErroLnt(422, "Este PDI já está encerrado.");
  if (pdi.status === "Concluído") throw new ErroLnt(422, "PDI concluído não é encerrado: ele já tem o seu fim registrado.");
  if (pdi.status !== "Não iniciado" && pdi.status !== "Em andamento") throw new ErroLnt(422, `PDI com status "${pdi.status}" não pode ser encerrado.`);

  // o cadastro precisa provar que a pessoa saiu (e nenhum homônimo ativo pode estar sendo confundido com ela)
  const { data: pessoas, error: pErro } = await supabaseAdmin.from("colaboradores").select(`id, ${COLUNAS_SITUACAO}`).eq("nome", pdi.colaborador_nome);
  if (pErro) erroBanco(pErro, "Colaborador");
  if (!pessoas || pessoas.length === 0) throw new ErroLnt(422, "Colaborador do PDI não encontrado no cadastro.");
  if (pessoas.some((p) => linhaAtiva(p))) throw new ErroLnt(422, "O colaborador deste PDI não consta como desligado: só o PDI de quem saiu da empresa pode ser encerrado.");

  const { data: rh, error: rhErro } = await supabaseAdmin.from("colaboradores").select("nome").eq("id", conta.colaboradorId).maybeSingle();
  if (rhErro) erroBanco(rhErro, "Responsável");
  const responsavel = (rh?.nome as string | undefined) ?? "RH";

  // fotografia do que será preservado (vai para a auditoria)
  const { data: itens, error: iErro } = await supabaseAdmin.from("peopleflow_pdi_itens").select("id").eq("pdi_id", pdi.id);
  if (iErro) erroBanco(iErro, "Itens do PDI");
  const idsItens = (itens ?? []).map((i) => String(i.id));
  const { data: acoes, error: aErro } = idsItens.length
    ? await supabaseAdmin.from("peopleflow_pdi_acoes").select("id, status").in("item_id", idsItens)
    : { data: [] as { id: string; status: string }[], error: null };
  if (aErro) erroBanco(aErro, "Ações do PDI");
  const porStatus: Record<string, number> = {};
  for (const a of acoes ?? []) porStatus[String(a.status)] = (porStatus[String(a.status)] ?? 0) + 1;

  const agora = new Date().toISOString();
  // `.eq("status", ...)`: se alguém mudou o PDI entre a leitura e a gravação, nada é gravado
  const { data: atualizado, error: uErro } = await supabaseAdmin
    .from("peopleflow_pdi")
    .update({ status: "Encerrado", encerrado_em: agora, encerrado_por: responsavel, encerrado_motivo: motivo })
    .eq("id", pdi.id)
    .eq("status", pdi.status)
    .select("status, encerrado_por, encerrado_em, encerrado_motivo, updated_at")
    .maybeSingle();
  if (uErro) erroBanco(uErro, "PDI");
  if (!atualizado) throw new ErroLnt(409, "O PDI foi alterado por outra pessoa. Atualize a tela e tente de novo.");

  const { error: audErro } = await supabaseAdmin.from("peopleflow_dev_auditoria").insert({
    user_id: conta.userId,
    colaborador_id: conta.colaboradorId,
    acao: "pdi_encerrado",
    entidade: "peopleflow_pdi",
    entidade_id: String(pdi.id),
    detalhe: {
      colaborador_nome: pdi.colaborador_nome,
      ciclo: pdi.ciclo,
      antes: { status: pdi.status },
      depois: { status: "Encerrado" },
      motivo_codigo: "desligamento",
      motivo,
      preservado: { itens: idsItens.length, acoes: (acoes ?? []).length, acoes_por_status: porStatus },
    },
  });
  if (audErro) throw new ErroLnt(500, `Auditoria: ${audErro.message}`);
  return atualizado;
}

export const ACOES_PDI_ENCERRAMENTO: Record<string, (conta: ContaDev, corpo: Corpo) => Promise<unknown>> = {
  pdi_encerrar: pdiEncerrar,
};
