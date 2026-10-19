// Pendências do módulo Desenvolvimento ligadas a colaboradores DESLIGADOS (somente leitura): turmas, treinamentos, necessidades,
// triagem do PDI e responsáveis da gestão. Só LISTA — nenhum registro é alterado, concluído ou removido; a decisão é do RH.
// O relatório das demais áreas (AVD, potencial, PDI, MPs, financeiro) está em src/domain/pendenciasDesligados.ts (dados que o front já tem).

import type { PendenciaDesligado } from "../../src/domain/pendenciasDesligados.js";
import { COLUNAS_SITUACAO, linhaAtiva, type BancoColaboradores, type LinhaSituacao } from "./situacaoColaboradores.js";

type Linha = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function ler(db: BancoColaboradores, tabela: string, colunas: string, filtro?: (q: any) => any): Promise<Linha[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    let q = db.from(tabela).select(colunas);
    if (filtro) q = filtro(q);
    const { data, error } = await q;
    if (error) return []; // tabela ainda não instalada neste ambiente: sem pendência a listar
    return (data ?? []) as Linha[];
  } catch {
    return [];
  }
}

export async function pendenciasDesenvolvimentoDeDesligados(db: BancoColaboradores, hoje?: string): Promise<PendenciaDesligado[]> {
  const pessoas = (await ler(db, "colaboradores", `id, nome, ${COLUNAS_SITUACAO}`)) as ({ id: number; nome: string } & LinhaSituacao)[];
  const ativosPorNome = new Set(pessoas.filter((p) => linhaAtiva(p, "acesso", hoje)).map((p) => p.nome));
  // desligado = o cadastro prova que saiu (e nenhum homônimo ativo mascara a situação)
  const desligados = pessoas.filter((p) => !linhaAtiva(p, "acesso", hoje) && !ativosPorNome.has(p.nome));
  if (desligados.length === 0) return [];
  const idsDesligados = new Set(desligados.map((p) => Number(p.id)));
  const nomeDe = new Map(desligados.map((p) => [Number(p.id), p.nome]));
  const out: PendenciaDesligado[] = [];

  // ── turmas: participante desligado em treinamento ainda não concluído ──
  const treinamentos = await ler(db, "peopleflow_dev_treinamentos", "id, codigo, titulo, status, homologacao, responsavel_colaborador_id, instrutor_colaborador_id");
  const abertos = new Map(treinamentos.filter((t) => ["solicitado", "planejado", "em_andamento"].includes(String(t.status)) && !t.homologacao).map((t) => [Number(t.id), t]));
  const participantes = await ler(db, "peopleflow_dev_participantes", "treinamento_id, colaborador_id, removido_em");
  for (const p of participantes) {
    const t = abertos.get(Number(p.treinamento_id));
    if (!t || p.removido_em || !idsDesligados.has(Number(p.colaborador_id))) continue;
    out.push({
      modulo: "Treinamentos",
      processo: `Turma — ${t.codigo ?? "#" + t.id} ${t.titulo ?? ""}`.trim(),
      colaborador: nomeDe.get(Number(p.colaborador_id)) ?? "",
      detalhe: `Participante desligado(a) ainda na turma (treinamento ${t.status}); a presença ficaria pendente.`,
      acaoRecomendada: "Remover da turma antes de iniciar/concluir (RH ou responsável). Histórico e certificados são preservados.",
      referencia: String(t.id),
    });
  }
  // ── responsável/instrutor desligado em treinamento não concluído ──
  for (const t of abertos.values()) {
    for (const [campo, papel] of [["responsavel_colaborador_id", "Responsável"], ["instrutor_colaborador_id", "Instrutor(a)"]] as const) {
      const id = t[campo] == null ? null : Number(t[campo]);
      if (id !== null && idsDesligados.has(id)) {
        out.push({ modulo: "Treinamentos", processo: `Treinamento — ${t.codigo ?? "#" + t.id} ${t.titulo ?? ""}`.trim(), colaborador: nomeDe.get(id) ?? "", detalhe: `${papel} do treinamento (${t.status}) foi desligado(a); a edição fica bloqueada até trocar.`, acaoRecomendada: `Definir novo ${papel.toLowerCase()} (RH) ou cancelar o treinamento.`, referencia: String(t.id) });
      }
    }
  }
  // ── necessidades de desenvolvimento abertas ──
  const necessidades = await ler(db, "peopleflow_dev_necessidades", "id, colaborador_id, descricao, status, origem");
  for (const n of necessidades) {
    if (!idsDesligados.has(Number(n.colaborador_id)) || ["atendida", "cancelada"].includes(String(n.status))) continue;
    out.push({ modulo: "LNT / Necessidades", processo: `Necessidade nº ${n.id} (${n.status})`, colaborador: nomeDe.get(Number(n.colaborador_id)) ?? "", detalhe: String(n.descricao ?? "").slice(0, 140), acaoRecomendada: "Cancelar com motivo (RH) ou manter só como registro histórico; não entra em novas convocações.", referencia: String(n.id) });
  }
  // ── triagem do PDI: sugestão pendente de pessoa desligada ──
  const sugestoes = await ler(db, "peopleflow_dev_pdi_sugestoes", "id, pdi_id, estado");
  const pendentes = sugestoes.filter((s) => s.estado === "pendente");
  if (pendentes.length > 0) {
    const pdis = await ler(db, "peopleflow_pdi", "id, colaborador_nome", (q) => q.in("id", [...new Set(pendentes.map((s) => Number(s.pdi_id)))]));
    const nomePdi = new Map(pdis.map((p) => [Number(p.id), String(p.colaborador_nome)]));
    const nomesDesl = new Set(desligados.map((p) => p.nome));
    for (const s of pendentes) {
      const nome = nomePdi.get(Number(s.pdi_id));
      if (nome && nomesDesl.has(nome)) out.push({ modulo: "PDI — triagem de necessidades", processo: `Sugestão nº ${s.id} (pendente)`, colaborador: nome, detalhe: "Sugestão de necessidade pendente de colaborador(a) desligado(a).", acaoRecomendada: "Manter somente no PDI (RH). Não confirmar necessidade.", referencia: String(s.id) });
    }
  }
  // ── responsáveis por treinamentos da gestão ──
  const indicacoes = await ler(db, "peopleflow_dev_responsaveis_gestao", "id, gestor_colaborador_id, colaborador_id, ativo");
  for (const r of indicacoes) {
    if (!r.ativo) continue;
    for (const [campo, papel] of [["colaborador_id", "responsável indicado"], ["gestor_colaborador_id", "gestor que indicou"]] as const) {
      const id = Number(r[campo]);
      if (idsDesligados.has(id)) out.push({ modulo: "Treinamentos", processo: `Responsável da gestão — indicação nº ${r.id}`, colaborador: nomeDe.get(id) ?? "", detalhe: `O ${papel} foi desligado(a); a indicação continua vigente.`, acaoRecomendada: "Revogar a indicação (gestor/RH).", referencia: String(r.id) });
    }
  }
  return out;
}
