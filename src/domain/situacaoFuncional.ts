// REGRA ÚNICA de situação funcional (ativo / desligado / ainda não iniciado / fora do quadro) numa data de referência.
//
// Usada pelo front, pelo servidor (api/) e espelhada em SQL (`peopleflow_situacao_funcional_em`, ver
// supabase/desligamentos_historico_e_situacao.sql — a paridade TS × SQL é testada). Funções puras, sem estado e sem I/O.
//
// Centralizar a regra NÃO é aplicar o mesmo filtro em todo lugar: cada módulo escolhe o ESCOPO que combina com a sua finalidade.
//
//  • "quadro"       → indicadores de pessoas (headcount, admissões, turnover…), sempre numa data de referência.
//                      Afiliada fica de fora; precisa de admissão válida e já iniciada; desligado só sai do quadro a partir da data efetiva.
//  • "operacional"  → listas e seletores de operações atuais (participantes, responsáveis, gestores, ciclos…), na data de hoje.
//                      Afiliada fica de fora (não é colaboradora da MSB); admissão futura ou ausente NÃO bloqueia (o pré-cadastro de quem
//                      vai entrar já precisa aparecer, ex.: agenda de integração); desligado não aparece.
//  • "acesso"       → quem pode entrar no portal. Como "operacional", mas afiliada entra (é ela quem usa o portal).
//
// Casos de borda (todos explícitos aqui, nunca decididos por cada tela):
//  • desligado com data FUTURA  → continua ativo até a data (efetivação agendada);
//  • desligado SEM data         → tratado como desligado de hoje em diante; em datas passadas conta como ativo (não se sabe quando saiu —
//                                 evita subcontar o histórico) e sai no relatório de qualidade de dados;
//  • data do desligamento = ref → já está desligado nesse dia (mesmo critério histórico do Dashboard Executivo);
//  • datas aceitas em ISO ("aaaa-mm-dd"), "dd/mmm/aaaa" (formato do app) e "dd/mm/aaaa"; tudo é normalizado para ISO antes de comparar.

export type EscopoSituacao = "quadro" | "operacional" | "acesso";
export type SituacaoFuncional = "ativo" | "desligado" | "nao_iniciado" | "fora_do_quadro";

/** Campos mínimos de uma pessoa para decidir a situação (aceita o `Colaborador` do front e a linha crua do banco). */
export interface DadosFuncionais {
  admissaoIso?: string | null;
  admissao?: string | null;
  desligado?: boolean | null;
  dataDesligamentoIso?: string | null;
  dataDesligamento?: string | null;
  empresaAfiliada?: boolean | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Normaliza para "aaaa-mm-dd" (ou null). Aceita ISO (com ou sem hora), "dd/mmm/aaaa" e "dd/mm/aaaa". */
export function normalizarDataIso(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const v = String(valor).trim();
  if (!v || v === "—") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(v);
  if (iso) return validar(iso[1], iso[2], iso[3]);
  const partes = v.split("/");
  if (partes.length === 3) {
    const [d, m, a] = partes;
    const mesNum = /^\d{1,2}$/.test(m) ? Number(m) : MESES.indexOf(m.toLowerCase()) + 1;
    if (mesNum >= 1 && mesNum <= 12 && /^\d{1,2}$/.test(d) && /^\d{4}$/.test(a)) return validar(a, String(mesNum).padStart(2, "0"), d.padStart(2, "0"));
  }
  return null;
}

function validar(a: string, m: string, d: string): string | null {
  const data = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
  return data.getUTCFullYear() === Number(a) && data.getUTCMonth() === Number(m) - 1 && data.getUTCDate() === Number(d) ? `${a}-${m}-${d}` : null;
}

/** "Hoje" no fuso de Brasília ("aaaa-mm-dd") — igual no navegador e no servidor (a Vercel roda em UTC). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export interface ResultadoSituacao {
  situacao: SituacaoFuncional;
  /** Verdadeiro quando a pessoa conta como "ativa" no escopo pedido. */
  ativo: boolean;
  /** Dado de baixa qualidade que o relatório de pendências deve mostrar (ex.: desligado sem data). */
  alerta?: "desligado_sem_data";
}

export function situacaoFuncionalEm(dados: DadosFuncionais, refIso: string, escopo: EscopoSituacao, hoje: string = hojeBrasilia()): ResultadoSituacao {
  if (escopo !== "acesso" && dados.empresaAfiliada) return { situacao: "fora_do_quadro", ativo: false };

  let alerta: ResultadoSituacao["alerta"];
  if (dados.desligado) {
    const desl = normalizarDataIso(dados.dataDesligamentoIso ?? dados.dataDesligamento);
    if (desl) {
      if (desl <= refIso) return { situacao: "desligado", ativo: false };
    } else {
      alerta = "desligado_sem_data";
      if (refIso >= hoje) return { situacao: "desligado", ativo: false, alerta };
    }
  }

  if (escopo === "quadro") {
    const adm = normalizarDataIso(dados.admissaoIso ?? dados.admissao);
    if (!adm || adm > refIso) return { situacao: "nao_iniciado", ativo: false, ...(alerta ? { alerta } : {}) };
  }
  return { situacao: "ativo", ativo: true, ...(alerta ? { alerta } : {}) };
}

export function estaAtivoEm(dados: DadosFuncionais, refIso: string, escopo: EscopoSituacao, hoje?: string): boolean {
  return situacaoFuncionalEm(dados, refIso, escopo, hoje).ativo;
}

/** Ativo "hoje" (operações atuais). */
export function estaAtivoHoje(dados: DadosFuncionais, escopo: Exclude<EscopoSituacao, "quadro"> = "operacional", hoje: string = hojeBrasilia()): boolean {
  return situacaoFuncionalEm(dados, hoje, escopo, hoje).ativo;
}

export function filtrarAtivosEm<T extends DadosFuncionais>(lista: T[], refIso: string, escopo: EscopoSituacao, hoje?: string): T[] {
  return lista.filter((c) => estaAtivoEm(c, refIso, escopo, hoje));
}

/** Linha crua do banco (`colaboradores`) → dados funcionais. */
export function dadosFuncionaisDeLinha(linha: { admissao?: string | null; desligado?: boolean | null; data_desligamento?: string | null; empresa_afiliada?: boolean | null }): DadosFuncionais {
  return { admissao: linha.admissao, desligado: linha.desligado, dataDesligamento: linha.data_desligamento, empresaAfiliada: linha.empresa_afiliada };
}
