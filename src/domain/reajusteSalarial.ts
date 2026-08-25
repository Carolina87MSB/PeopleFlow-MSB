// Reajuste Salarial — resultado da AVD (ver GestaoDesempenhoPage.tsx > aba
// "Reajuste Salarial"). Funções puras: cálculo, parsing da planilha colada
// (texto tab/;/,-separado) e validação linha a linha contra o cadastro e o
// salário vigente já existente (salarioVigente() em domain/salario.ts) —
// nunca uma segunda estrutura de salário. Ver README > "Reajuste Salarial".

import type { Colaborador, Movimentacao, ReajusteSalarial, SalarioBase } from "../types/domain";
import { norm } from "./hierarquia";
import { formatarValorMonetario, salarioVigente } from "./salario";

export function gerarIdReajusteSalarial(): string {
  return `REAJ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Reajuste Efetivo = Reajuste Base × Fatorial / 100 — ambos em pontos
 * percentuais (6 = 6%, 125 = 125%), mesma convenção de ConfigEncargosFolha.
 * Ex.: reajusteEfetivo(6, 125) = 7,5. O Fatorial NUNCA é o percentual final. */
export function reajusteEfetivo(reajusteBasePct: number, fatorialPct: number): number {
  return (reajusteBasePct * fatorialPct) / 100;
}

/** Novo Salário = Salário Atual × (1 + Reajuste Efetivo / 100). */
export function novoSalarioReajustado(salarioAtual: number, reajusteEfetivoPct: number): number {
  return salarioAtual * (1 + reajusteEfetivoPct / 100);
}

const MESES_COMPETENCIA = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "Agosto/2026" → "2026-08-01" (dia 01 — competência é só mês/ano). `null`
 * se o texto não bater com o formato "Mês/aaaa". */
export function competenciaParaIso(competencia: string): string | null {
  const m = competencia.trim().match(/^([^/]+)\/\s*(\d{4})$/);
  if (!m) return null;
  const mesIdx = MESES_COMPETENCIA.indexOf(norm(m[1].trim()));
  if (mesIdx < 0) return null;
  return `${m[2]}-${String(mesIdx + 1).padStart(2, "0")}-01`;
}

export interface LinhaReajusteBruta {
  vinculo: string;
  colaborador: string;
  /** `null` = célula vazia/não reconhecida como número — nunca 0. */
  salario: number | null;
  /** Já convertido pra pontos percentuais (0,06 na planilha vira 6 aqui). */
  reajusteBase: number | null;
  /** Já convertido pra pontos percentuais (1,25 na planilha vira 125 aqui). */
  fatorial: number | null;
  novoSalario: number | null;
}

/** Parser numérico tolerante a formato brasileiro ("1.621,00") ou simples
 * ("0,06"/"1.25"/"4350.525") — diferente de parseValorMonetario()
 * (domain/salario.ts), aceita QUALQUER quantidade de casas decimais, não só
 * 1-2: os valores exportados de planilha (ex.: "Novo Salário" calculado sem
 * arredondar, "3947.2492") legitimamente têm mais de 2 casas, e não são
 * texto digitado livremente por humano — não há motivo pra ser tão
 * conservador quanto o parser de valor monetário digitado.
 *
 * Ao colar do Excel (Ctrl+C → Ctrl+V), o clipboard traz o texto **exibido
 * na célula**, não o valor bruto — uma célula de moeda formatada mostra
 * "R$ 1.621,00" (nunca "1621") e uma célula com separador de milhar por
 * espaço mostra "1 621,00"; por isso remove "R$" e qualquer espaço (incl.
 * espaço não separável, comum em exportações do Excel) antes de tentar
 * casar os formatos numéricos. */
function parseNumero(texto: string | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/r\$/i, "").replace(/[\s ]/g, "").trim();
  if (!limpo) return null;

  // Formato brasileiro: milhar "." + decimal "," (qualquer nº de casas).
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(limpo)) {
    return Number(limpo.replace(/\./g, "").replace(",", "."));
  }
  // Número simples, decimal em "." ou "," (qualquer nº de casas).
  if (/^\d+([.,]\d+)?$/.test(limpo)) {
    return Number(limpo.replace(",", "."));
  }
  return null;
}

/** Percentual em pontos (6 = 6%) a partir de uma célula colada do Excel —
 * aceita tanto a forma bruta ("0,06", fração) quanto a forma já exibida
 * como percentual quando a célula tem formato de porcentagem ("6%",
 * "125%") — nesse caso o número antes do "%" JÁ é o valor em pontos, não
 * multiplica por 100 de novo (senão "6%" viraria 600). REAJUSTE BASE e
 * FATORIAL são tipicamente formatados como porcentagem na planilha de
 * origem, então este é o caminho mais comum na prática, não uma exceção. */
function parsePercentual(texto: string | undefined): number | null {
  if (!texto) return null;
  const semEspacos = texto.trim();
  const comSinalPercentual = semEspacos.endsWith("%");
  const numero = parseNumero(comSinalPercentual ? semEspacos.slice(0, -1) : semEspacos);
  if (numero === null) return null;
  return comSinalPercentual ? numero : numero * 100;
}

/** Aceita o texto colado direto do Excel (tab-separated) ou CSV (`;`/`,`),
 * com cabeçalho VINCULO / COLABORADOR / SALÁRIO / REAJUSTE BASE / FATORIAL /
 * NOVO SALÁRIO em qualquer ordem de coluna (ADMISSÃO, se existir, é
 * ignorada — não usada por esta funcionalidade). Nenhuma linha é
 * descartada aqui — toda linha colada vira uma `LinhaReajusteBruta`, mesmo
 * que incompleta; quem decide o que é elegível é validarLinhaReajuste(). */
export function parseTabelaReajuste(texto: string): LinhaReajusteBruta[] {
  const linhas = texto
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (linhas.length < 2) return [];

  const separador = linhas[0].includes("\t") ? "\t" : linhas[0].includes(";") ? ";" : ",";
  const cabecalho = linhas[0].split(separador).map((h) => norm(h.trim()));

  const idx = {
    vinculo: cabecalho.indexOf("vinculo"),
    colaborador: cabecalho.indexOf("colaborador"),
    salario: cabecalho.indexOf("salario"),
    reajusteBase: cabecalho.indexOf("reajuste base"),
    fatorial: cabecalho.indexOf("fatorial"),
    novoSalario: cabecalho.indexOf("novo salario"),
  };

  return linhas.slice(1).map((linha) => {
    const campos = linha.split(separador);
    return {
      vinculo: (idx.vinculo >= 0 ? campos[idx.vinculo] : "")?.trim() ?? "",
      colaborador: (idx.colaborador >= 0 ? campos[idx.colaborador] : "")?.trim() ?? "",
      salario: idx.salario >= 0 ? parseNumero(campos[idx.salario]) : null,
      reajusteBase: idx.reajusteBase >= 0 ? parsePercentual(campos[idx.reajusteBase]) : null,
      fatorial: idx.fatorial >= 0 ? parsePercentual(campos[idx.fatorial]) : null,
      novoSalario: idx.novoSalario >= 0 ? parseNumero(campos[idx.novoSalario]) : null,
    };
  });
}

export type StatusLinhaReajuste = "elegivel" | "pj" | "naoEncontrado" | "divergencia" | "duplicado" | "invalido";

export interface LinhaReajusteValidada {
  linha: LinhaReajusteBruta;
  status: StatusLinhaReajuste;
  motivo: string | null;
  /** Nome exatamente como está em `colaboradores` (pode diferir de linha.colaborador em acento/caixa). */
  colaboradorNome: string | null;
  salarioAtualSistema: number | null;
  reajusteEfetivoCalculado: number | null;
  novoSalarioCalculado: number | null;
}

const TOLERANCIA_REAIS = 0.01;

/** Confere uma linha da planilha contra o cadastro e o salário vigente já
 * existente — NUNCA aceita o valor da planilha cegamente. Regras, na ordem:
 * PJ é excluído (reajuste coletivo não se aplica) → colaborador precisa
 * existir no cadastro → não pode já existir um reajuste igual (mesma
 * competência+origem) pro mesmo colaborador — checado ANTES da comparação
 * de salário de propósito: depois que um reajuste já foi aplicado, o
 * salário vigente do colaborador muda, então reimportar a MESMA planilha
 * original naturalmente deixaria de "bater" com o valor antigo — isso não
 * é uma divergência de dado, é só o reajuste já ter acontecido, e precisa
 * dizer exatamente isso, não confundir o RH com uma mensagem de
 * inconsistência → linha precisa estar completa → salário da planilha
 * precisa bater com o salarioVigente() atual do sistema → Novo Salário
 * informado precisa bater com o recalculado (Salário × (1 + Reajuste
 * Efetivo)). Só "elegivel" pode virar um ReajusteSalarial de fato. */
export function validarLinhaReajuste(
  linha: LinhaReajusteBruta,
  colaboradores: Colaborador[],
  movimentacoes: Movimentacao[],
  salariosBase: SalarioBase[],
  reajustesExistentes: ReajusteSalarial[],
  competenciaIso: string,
  origem: string,
): LinhaReajusteValidada {
  const vazio: LinhaReajusteValidada = {
    linha,
    status: "invalido",
    motivo: null,
    colaboradorNome: null,
    salarioAtualSistema: null,
    reajusteEfetivoCalculado: null,
    novoSalarioCalculado: null,
  };

  if (norm(linha.vinculo) === norm("PJ")) {
    return { ...vazio, status: "pj", motivo: "Colaborador PJ — reajuste coletivo não se aplica." };
  }

  const colaborador = colaboradores.find((c) => norm(c.nome) === norm(linha.colaborador));
  if (!colaborador) {
    return { ...vazio, status: "naoEncontrado", motivo: "Nome não encontrado no cadastro de colaboradores." };
  }

  const jaExiste = reajustesExistentes.some(
    (r) => norm(r.colaboradorNome) === norm(colaborador.nome) && r.competenciaIso === competenciaIso && r.origem === origem,
  );
  if (jaExiste) {
    return {
      ...vazio,
      colaboradorNome: colaborador.nome,
      status: "duplicado",
      motivo: "Já aplicado anteriormente para esta competência e origem.",
    };
  }

  if (linha.salario === null || linha.reajusteBase === null || linha.fatorial === null || linha.novoSalario === null) {
    return {
      ...vazio,
      colaboradorNome: colaborador.nome,
      motivo: "Linha incompleta — falta Salário, Reajuste Base, Fatorial ou Novo Salário.",
    };
  }

  const atual = salarioVigente(colaborador.nome, movimentacoes, reajustesExistentes, salariosBase);
  if (atual === null) {
    return {
      ...vazio,
      colaboradorNome: colaborador.nome,
      motivo: "Colaborador sem salário vigente registrado no sistema — não é possível conferir.",
    };
  }
  if (Math.abs(atual.valor - linha.salario) > TOLERANCIA_REAIS) {
    return {
      ...vazio,
      colaboradorNome: colaborador.nome,
      salarioAtualSistema: atual.valor,
      status: "divergencia",
      motivo: `Salário no sistema (${formatarValorMonetario(atual.valor)}) diferente do informado na planilha (${formatarValorMonetario(linha.salario)}).`,
    };
  }

  const efetivo = reajusteEfetivo(linha.reajusteBase, linha.fatorial);
  const novoCalculado = novoSalarioReajustado(atual.valor, efetivo);
  if (Math.abs(novoCalculado - linha.novoSalario) > TOLERANCIA_REAIS) {
    return {
      ...vazio,
      colaboradorNome: colaborador.nome,
      salarioAtualSistema: atual.valor,
      reajusteEfetivoCalculado: efetivo,
      novoSalarioCalculado: novoCalculado,
      status: "divergencia",
      motivo: `Novo salário informado (${formatarValorMonetario(linha.novoSalario)}) diverge do calculado (${formatarValorMonetario(novoCalculado)}).`,
    };
  }

  return {
    ...vazio,
    colaboradorNome: colaborador.nome,
    salarioAtualSistema: atual.valor,
    reajusteEfetivoCalculado: efetivo,
    novoSalarioCalculado: novoCalculado,
    status: "elegivel",
    motivo: null,
  };
}

/** Monta o registro final a partir de uma linha "elegivel" — `null` pra
 * qualquer outro status (nunca aplica uma linha com pendência). */
export function construirReajusteSalarial(
  validada: LinhaReajusteValidada,
  competencia: string,
  competenciaIso: string,
  origem: string,
  aplicadoPor: string,
): ReajusteSalarial | null {
  if (
    validada.status !== "elegivel" ||
    !validada.colaboradorNome ||
    validada.salarioAtualSistema === null ||
    validada.reajusteEfetivoCalculado === null ||
    validada.novoSalarioCalculado === null ||
    validada.linha.reajusteBase === null ||
    validada.linha.fatorial === null
  ) {
    return null;
  }
  return {
    id: gerarIdReajusteSalarial(),
    colaboradorNome: validada.colaboradorNome,
    competencia,
    competenciaIso,
    origem,
    salarioAnterior: validada.salarioAtualSistema,
    reajusteBase: validada.linha.reajusteBase,
    fatorial: validada.linha.fatorial,
    reajusteEfetivo: validada.reajusteEfetivoCalculado,
    novoSalario: validada.novoSalarioCalculado,
    aplicadoEm: new Date().toISOString(),
    aplicadoPor,
  };
}
