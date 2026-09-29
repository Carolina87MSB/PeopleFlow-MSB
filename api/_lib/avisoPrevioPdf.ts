// Geração do Aviso Prévio Indenizado (RH, 2026-09) — overlay com pdf-lib
// sobre o PDF-base institucional (avisoPrevioTemplateIndenizado.ts), nunca
// redesenhado do zero. O PDF-base já tem tudo fixo (logo, cabeçalho, título,
// texto legal, assinaturas, "CIENTE", rodapé) — esta função só cobre com
// branco e redesenha os 4 pontos variáveis, nas coordenadas exatas
// calibradas uma única vez com pdfjs-dist sobre esse mesmo arquivo (ver
// comentário em avisoPrevioTemplateIndenizado.ts).
//
// O parágrafo de abertura ("Pelo presente... [CARGO],") é reconstruído por
// inteiro (não só os 3 trechos variáveis) porque nome/CPF/cargo variam de
// tamanho e ficam embutidos NO MEIO da frase — sobrepor só o trecho do
// placeholder faria o texto novo colidir com a pontuação/palavras fixas que
// vêm na sequência. Reconstruir o parágrafo com quebra de linha (e encolher
// a fonte só se realmente precisar, RH 2026-09) garante que nunca há
// sobreposição, mantendo o mesmo espaço de 3 linhas do modelo original — a
// data e a assinatura (cada uma sozinha na própria linha, sem texto fixo
// colado depois) não precisam desse tratamento.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AVISO_PREVIO_INDENIZADO_PDF_BASE64 } from "./avisoPrevioTemplateIndenizado.js";

export interface DadosAvisoPrevioIndenizado {
  nomeCompleto: string;
  cpf: string;
  cargo: string;
  /** Já formatada por extenso, ex.: "13 de julho de 2026" (ver formatarDataExtenso() abaixo). */
  dataExtenso: string;
}

const PRETO = rgb(0, 0, 0);

// ── Coordenadas calibradas sobre o PDF-base (pdfjs-dist, ver histórico da
//    implementação) — página A4 (595.56 x 842.04pt nesta exportação do Word).
//    Se o PDF-base for substituído por um novo modelo institucional, estas
//    coordenadas precisam ser recalibradas junto (não são genéricas).
const PARAGRAFO = {
  x: 36,
  yPrimeiraLinha: 603.1,
  maxWidth: 523,
  tamanhoBase: 11.04,
  entrelinhaBase: 13.45,
  maxLinhas: 3,
  mascara: { x: 30, y: 571, width: 536, height: 44 },
};
const DATA_LINHA = {
  x: 36.12,
  y: 465.19,
  tamanho: 11.04,
  maxWidth: 523,
  mascara: { x: 30, y: 461, width: 536, height: 17 },
};
const ASSINATURA_NOME = {
  centroX: 294.34,
  y: 253.85,
  tamanho: 11.04,
  maxWidth: 400,
  // Altura contida pra não invadir a linha de assinatura logo acima (stroke
  // real do PDF-base em y=265.59, x=[85.1, 501.21] — confirmado extraindo os
  // operadores de desenho do PDF-base, não só o texto). Uma máscara mais alta
  // apaga o trecho da linha que cruza com ela, deixando só as pontas visíveis.
  mascara: { x: 130, y: 249, width: 330, height: 14 },
};
const ASSINATURA_CPF = {
  centroX: 294.43,
  y: 240.41,
  tamanho: 11.04,
  maxWidth: 200,
  mascara: { x: 220, y: 237, width: 150, height: 16 },
};

interface Trecho {
  texto: string;
  negrito: boolean;
}

function larguraTrecho(texto: string, negrito: boolean, tamanho: number, fontes: { normal: PDFFont; negrito: PDFFont }): number {
  return (negrito ? fontes.negrito : fontes.normal).widthOfTextAtSize(texto, tamanho);
}

/** Quebra uma sequência de trechos (mistura negrito/normal) em linhas que
 * cabem em `maxWidth`, preservando a formatação de cada palavra. Uma palavra
 * sozinha maior que `maxWidth` nunca é cortada no meio — só estoura a linha
 * (caso extremo, não esperado com nomes/cargos reais). */
function quebrarTrechos(trechos: Trecho[], maxWidth: number, tamanho: number, fontes: { normal: PDFFont; negrito: PDFFont }): Trecho[][] {
  type Palavra = { texto: string; negrito: boolean };
  const palavras: Palavra[] = [];
  trechos.forEach((t) => {
    const partes = t.texto.split(" ");
    partes.forEach((p, i) => {
      if (!p) return;
      const comEspaco = i < partes.length - 1 ? p + " " : p;
      // Uma "palavra" que é só pontuação (a vírgula depois do nome/CPF/cargo,
      // por exemplo) nunca vira o início de uma linha sozinha — gruda no fim
      // da palavra anterior, com o negrito dela (não o da pontuação).
      const soPontuacao = /^[,.;:)\]]+\s*$/.test(p);
      if (soPontuacao && palavras.length > 0) {
        palavras[palavras.length - 1].texto += comEspaco;
      } else {
        palavras.push({ texto: comEspaco, negrito: t.negrito });
      }
    });
  });

  const linhas: Trecho[][] = [];
  let linhaAtual: Trecho[] = [];
  let larguraAtual = 0;

  for (const palavra of palavras) {
    const largura = larguraTrecho(palavra.texto, palavra.negrito, tamanho, fontes);
    if (larguraAtual + largura > maxWidth && linhaAtual.length > 0) {
      linhas.push(linhaAtual);
      linhaAtual = [];
      larguraAtual = 0;
    }
    const ultimo = linhaAtual[linhaAtual.length - 1];
    if (ultimo && ultimo.negrito === palavra.negrito) {
      ultimo.texto += palavra.texto;
    } else {
      linhaAtual.push({ texto: palavra.texto, negrito: palavra.negrito });
    }
    larguraAtual += largura;
  }
  if (linhaAtual.length) linhas.push(linhaAtual);
  return linhas;
}

/** Tenta `tamanhoBase`; se não couber em `maxLinhas` linhas, encolhe em
 * passos de 0.25pt (até um piso de 8.5pt) até caber — nunca deixa o
 * parágrafo invadir o espaço da linha/parágrafo seguinte (RH, 2026-09:
 * "adaptação automática do tamanho da fonte... não provoque sobreposição").
 * A entrelinha encolhe na mesma proporção do tamanho da fonte. */
function ajustarParagrafo(
  trechos: Trecho[],
  maxWidth: number,
  maxLinhas: number,
  tamanhoBase: number,
  entrelinhaBase: number,
  fontes: { normal: PDFFont; negrito: PDFFont },
): { linhas: Trecho[][]; tamanho: number; entrelinha: number } {
  const PISO = 8.5;
  for (let tamanho = tamanhoBase; tamanho >= PISO; tamanho -= 0.25) {
    const linhas = quebrarTrechos(trechos, maxWidth, tamanho, fontes);
    if (linhas.length <= maxLinhas) {
      return { linhas, tamanho, entrelinha: entrelinhaBase * (tamanho / tamanhoBase) };
    }
  }
  // Caso extremo (nome+cargo combinados absurdamente longos): usa o piso
  // mesmo estourando maxLinhas — nunca trunca texto de um documento legal.
  const tamanho = PISO;
  return { linhas: quebrarTrechos(trechos, maxWidth, tamanho, fontes), tamanho, entrelinha: entrelinhaBase * (tamanho / tamanhoBase) };
}

function desenharLinhaMista(page: PDFPage, linha: Trecho[], x: number, y: number, tamanho: number, fontes: { normal: PDFFont; negrito: PDFFont }) {
  let cursor = x;
  for (const t of linha) {
    const fonte = t.negrito ? fontes.negrito : fontes.normal;
    page.drawText(t.texto, { x: cursor, y, size: tamanho, font: fonte, color: PRETO });
    cursor += fonte.widthOfTextAtSize(t.texto, tamanho);
  }
}

/** Encolhe (nunca aumenta) uma linha única até caber em `maxWidth` — usado
 * na data e na assinatura, onde o texto nunca deveria precisar de mais de 1
 * linha, mas o encolhimento automático entra como rede de segurança. */
function tamanhoParaCaberEmUmaLinha(texto: string, maxWidth: number, tamanhoBase: number, fonte: PDFFont): number {
  const PISO = 8;
  let tamanho = tamanhoBase;
  while (tamanho > PISO && fonte.widthOfTextAtSize(texto, tamanho) > maxWidth) tamanho -= 0.25;
  return tamanho;
}

const MESES_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "aaaa-mm-dd" -> "13 de julho de 2026". `null`/inválida -> string vazia
 * (a chamada que orquestra a geração decide se isso bloqueia ou não). */
export function formatarDataExtenso(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "";
  const [, ano, mes, dia] = m;
  const mesIdx = parseInt(mes, 10) - 1;
  if (!MESES_EXTENSO[mesIdx]) return "";
  return `${parseInt(dia, 10)} de ${MESES_EXTENSO[mesIdx]} de ${ano}`;
}

/** Normaliza qualquer formatação de CPF (com ou sem pontuação, o dado bruto
 * de `colaboradores.cpf` não tem formato garantido) para "999.999.999-99".
 * `null` se não tiver exatamente 11 dígitos — nunca gera o documento com um
 * CPF malformado ou incompleto. */
export function formatarCpf(bruto: string | null | undefined): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (digitos.length !== 11) return null;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}

export async function gerarAvisoPrevioIndenizadoPdf(dados: DadosAvisoPrevioIndenizado): Promise<Uint8Array> {
  const baseBytes = Buffer.from(AVISO_PREVIO_INDENIZADO_PDF_BASE64, "base64");
  const pdf = await PDFDocument.load(baseBytes);
  pdf.setTitle(`Aviso Prévio Indenizado — ${dados.nomeCompleto}`);
  pdf.setAuthor("PeopleFlow — MSB");
  pdf.setCreator("PeopleFlow — módulo Movimentação de Pessoal");
  pdf.setProducer("PeopleFlow");
  pdf.setSubject("Gerado automaticamente pelo PeopleFlow ao concluir o fluxo de aprovação do Desligamento.");

  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontes = { normal, negrito };

  const page = pdf.getPages()[0];
  const branco = rgb(1, 1, 1);
  const cobrir = (m: { x: number; y: number; width: number; height: number }) =>
    page.drawRectangle({ x: m.x, y: m.y, width: m.width, height: m.height, color: branco });

  // ── Parágrafo de abertura (nome, CPF e cargo embutidos na frase)
  cobrir(PARAGRAFO.mascara);
  const trechos: Trecho[] = [
    { texto: "Pelo presente, levamos ao conhecimento de ", negrito: false },
    { texto: dados.nomeCompleto, negrito: true },
    { texto: ", CPF nº ", negrito: false },
    { texto: dados.cpf, negrito: true },
    { texto: ", ocupante da função de ", negrito: false },
    { texto: dados.cargo, negrito: true },
    {
      texto:
        ", que não é mais do interesse desta empresa manter o seu Contrato de Trabalho. Vimos, por meio deste, " +
        "rescindi-lo na forma da legislação pertinente.",
      negrito: false,
    },
  ];
  const ajuste = ajustarParagrafo(trechos, PARAGRAFO.maxWidth, PARAGRAFO.maxLinhas, PARAGRAFO.tamanhoBase, PARAGRAFO.entrelinhaBase, fontes);
  ajuste.linhas.forEach((linha, i) => {
    desenharLinhaMista(page, linha, PARAGRAFO.x, PARAGRAFO.yPrimeiraLinha - i * ajuste.entrelinha, ajuste.tamanho, fontes);
  });

  // ── Data
  cobrir(DATA_LINHA.mascara);
  const linhaData = `Lauro de Freitas, ${dados.dataExtenso}.`;
  const tamanhoData = tamanhoParaCaberEmUmaLinha(linhaData, DATA_LINHA.maxWidth, DATA_LINHA.tamanho, normal);
  page.drawText(linhaData, { x: DATA_LINHA.x, y: DATA_LINHA.y, size: tamanhoData, font: normal, color: PRETO });

  // ── Assinatura — nome (centralizado, mesma posição do placeholder)
  cobrir(ASSINATURA_NOME.mascara);
  const tamanhoNomeAssinatura = tamanhoParaCaberEmUmaLinha(dados.nomeCompleto, ASSINATURA_NOME.maxWidth, ASSINATURA_NOME.tamanho, negrito);
  const larguraNomeAssinatura = negrito.widthOfTextAtSize(dados.nomeCompleto, tamanhoNomeAssinatura);
  page.drawText(dados.nomeCompleto, {
    x: ASSINATURA_NOME.centroX - larguraNomeAssinatura / 2,
    y: ASSINATURA_NOME.y,
    size: tamanhoNomeAssinatura,
    font: negrito,
    color: PRETO,
  });

  // ── Assinatura — CPF (centralizado)
  cobrir(ASSINATURA_CPF.mascara);
  const larguraCpfAssinatura = negrito.widthOfTextAtSize(dados.cpf, ASSINATURA_CPF.tamanho);
  page.drawText(dados.cpf, {
    x: ASSINATURA_CPF.centroX - larguraCpfAssinatura / 2,
    y: ASSINATURA_CPF.y,
    size: ASSINATURA_CPF.tamanho,
    font: negrito,
    color: PRETO,
  });

  return pdf.save();
}
