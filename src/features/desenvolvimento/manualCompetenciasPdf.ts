// Manual de Competências Comportamentais (PDF) — gerado no navegador com a
// pdf-lib que o projeto já usa no servidor (Lista de Presença, Aviso Prévio).
// Função pura: recebe as competências já carregadas do catálogo oficial e
// devolve o PDF. Conteúdo deliberadamente mínimo — número, nome e descrição
// oficial; nada de ids, cargos, colaboradores, AVD ou PDI.
//
// Este módulo é carregado sob demanda (import dinâmico no clique do botão), para
// a pdf-lib não entrar no pacote inicial do PeopleFlow.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export interface ItemManual {
  ordem: number;
  nome: string;
  descricao: string;
}

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const LARGURA = A4[0] - 2 * M;
const COR_TEXTO = rgb(0.2, 0.28, 0.35);
const COR_TITULO = rgb(0.06, 0.2, 0.36);
const COR_SUAVE = rgb(0.45, 0.52, 0.56);
const COR_LINHA = rgb(0.85, 0.89, 0.91);

const TITULO = "MANUAL DE COMPETÊNCIAS COMPORTAMENTAIS";
const EMPRESA = "MSB – Medical System do Brasil";

function formatarDataHora(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d).replace(",", "");
}

export async function gerarManualCompetenciasPdf(itens: ItemManual[], geradoEm: Date, logoPng?: Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Manual de Competências Comportamentais — MSB");
  pdf.setAuthor("PeopleFlow — MSB");
  pdf.setCreator("PeopleFlow");
  pdf.setProducer("PeopleFlow");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (logoPng) {
    try {
      logo = await pdf.embedPng(logoPng);
    } catch {
      logo = null; // sem logo, o cabeçalho segue só com o texto
    }
  }

  // Fontes padrão do PDF só codificam WinAnsi (acentos do português incluídos); o resto vira "?".
  const seguro = (s: string) =>
    [...(s ?? "")]
      .map((ch) => {
        try {
          normal.encodeText(ch);
          return ch;
        } catch {
          return "?";
        }
      })
      .join("")
      .replace(/[\r\n\t]+/g, " ");

  function quebrar(texto: string, tam: number, f: PDFFont, largura: number): string[] {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of seguro(texto).split(" ").filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (f.widthOfTextAtSize(tentativa, tam) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = palavra;
      }
    }
    if (atual) linhas.push(atual);
    return linhas;
  }

  const paginas: PDFPage[] = [];
  let pagina!: PDFPage;
  let y = 0;

  function cabecalhoPrimeiraPagina() {
    y = A4[1] - M;
    if (logo) {
      const h = 34;
      const w = (logo.width / logo.height) * h;
      pagina.drawImage(logo, { x: M, y: y - h, width: w, height: h });
      y -= h + 22;
    }
    pagina.drawText(seguro(TITULO), { x: M, y: y - 16, size: 16, font: negrito, color: COR_TITULO });
    y -= 36;
    pagina.drawText(seguro(EMPRESA), { x: M, y, size: 11, font: normal, color: COR_TEXTO });
    y -= 12;
    pagina.drawLine({ start: { x: M, y }, end: { x: M + LARGURA, y }, thickness: 0.8, color: COR_LINHA });
    y -= 22;
  }

  function novaPagina(primeira = false) {
    pagina = pdf.addPage(A4);
    paginas.push(pagina);
    if (primeira) cabecalhoPrimeiraPagina();
    else y = A4[1] - M;
  }

  novaPagina(true);
  const LIMITE_INFERIOR = M + 18;
  const TAM_NOME = 11.5;
  const TAM_DESC = 10.5;
  const ENTRELINHA = 14;

  for (const it of itens) {
    const titulo = `${it.ordem}. ${it.nome}`;
    const linhas = quebrar(it.descricao || "—", TAM_DESC, normal, LARGURA);
    const altura = TAM_NOME + 6 + linhas.length * ENTRELINHA + 18;
    if (y - altura < LIMITE_INFERIOR) novaPagina();
    pagina.drawText(seguro(titulo), { x: M, y: y - TAM_NOME, size: TAM_NOME, font: negrito, color: COR_TITULO });
    y -= TAM_NOME + 6;
    for (const l of linhas) {
      pagina.drawText(l, { x: M, y: y - TAM_DESC, size: TAM_DESC, font: normal, color: COR_TEXTO });
      y -= ENTRELINHA;
    }
    y -= 18;
  }

  const rodape = seguro(`Documento gerado pelo PeopleFlow · ${formatarDataHora(geradoEm)}`);
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: M + LARGURA, y: M - 6 }, thickness: 0.5, color: COR_LINHA });
    p.drawText(rodape, { x: M, y: M - 20, size: 8.5, font: normal, color: COR_SUAVE });
    const num = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(num, { x: M + LARGURA - normal.widthOfTextAtSize(num, 8.5), y: M - 20, size: 8.5, font: normal, color: COR_SUAVE });
  });

  return pdf.save();
}
