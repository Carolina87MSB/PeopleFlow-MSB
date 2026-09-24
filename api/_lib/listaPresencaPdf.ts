// Lista de Presença (PDF) gerada pelo PeopleFlow a partir dos registros individuais
// de presença. Função pura: recebe os dados já consolidados e devolve o PDF.
// A fonte primária da presença continua sendo peopleflow_dev_participantes + auditoria;
// o PDF é só a representação consolidada desses registros.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface ParticipanteLista {
  nome: string;
  cargo: string;
  departamento: string;
  situacao: "Presente" | "Ausente";
  forma: string; // "QR Code" | "Registro manual" | "—"
  confirmadoEm: string | null;
  registradoPor: string | null;
  justificativa: string | null;
}

export interface DadosListaPresenca {
  codigo: string;
  titulo: string;
  tipo: string;
  modalidade: string;
  formato: string;
  dataRealizacao: string;
  cargaRealizada: string;
  local: string;
  responsavel: string;
  instrutor: string;
  documento: { codigo: string; titulo: string; revisao: string } | null;
  reposicao: string | null;
  participantes: ParticipanteLista[];
  versao: number;
  motivoVersao: string | null;
  geradoEm: string;
  geradoPor: string;
  codigoVerificacao: string;
}

const A4: [number, number] = [595.28, 841.89];
const M = 40;
const LARGURA = A4[0] - 2 * M;
const COR_TEXTO = rgb(0.2, 0.28, 0.35);
const COR_SUAVE = rgb(0.45, 0.52, 0.56);
const COR_LINHA = rgb(0.85, 0.89, 0.91);
const COR_FUNDO = rgb(0.95, 0.97, 0.98);
const COR_AUSENTE = rgb(0.64, 0.23, 0.23);

export async function gerarPdfListaPresenca(d: DadosListaPresenca): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Lista de Presença ${d.codigo} — versão ${d.versao}`);
  pdf.setAuthor("PeopleFlow — MSB");
  pdf.setCreator("PeopleFlow — módulo Desenvolvimento");
  pdf.setProducer("PeopleFlow");
  pdf.setSubject(`Lista de presença gerada automaticamente · verificação ${d.codigoVerificacao}`);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Fontes padrão do PDF só codificam WinAnsi (acentos do português incluídos); o resto vira "?".
  const cache = new Map<string, boolean>();
  const seguro = (s: string) =>
    [...(s ?? "")]
      .map((ch) => {
        if (!cache.has(ch)) {
          try {
            normal.encodeText(ch);
            cache.set(ch, true);
          } catch {
            cache.set(ch, false);
          }
        }
        return cache.get(ch) ? ch : "?";
      })
      .join("")
      .replace(/[\r\n\t]+/g, " ");
  const caber = (s: string, largura: number, tam: number, f: PDFFont) => {
    let t = seguro(s);
    if (f.widthOfTextAtSize(t, tam) <= largura) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "…", tam) > largura) t = t.slice(0, -1);
    return t + "…";
  };
  const quebrar = (s: string, largura: number, tam: number, f: PDFFont) => {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of seguro(s).split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (f.widthOfTextAtSize(tentativa, tam) <= largura) atual = tentativa;
      else {
        if (atual) linhas.push(atual);
        atual = caber(palavra, largura, tam, f);
      }
    }
    if (atual) linhas.push(atual);
    return linhas.length ? linhas : [""];
  };

  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;
  const texto = (s: string, x: number, yy: number, tam: number, f: PDFFont = normal, cor = COR_TEXTO) => page.drawText(seguro(s), { x, y: yy, size: tam, font: f, color: cor });
  const novaPagina = () => {
    page = pdf.addPage(A4);
    y = A4[1] - M;
  };
  const garantir = (altura: number) => {
    if (y - altura < M + 30) novaPagina();
  };

  // ── Cabeçalho
  texto("LISTA DE PRESENÇA", M, y - 16, 16, negrito);
  const marca = "PeopleFlow — MSB";
  texto(marca, M + LARGURA - normal.widthOfTextAtSize(marca, 9), y - 12, 9, normal, COR_SUAVE);
  y -= 30;
  texto("Gerada automaticamente pelo PeopleFlow a partir dos registros individuais de presença.", M, y, 8.5, normal, COR_SUAVE);
  y -= 18;

  // ── Identificação
  const campo = (rotulo: string, valor: string, x: number, largura: number) => {
    texto(rotulo.toUpperCase(), x, y, 6.8, negrito, COR_SUAVE);
    const linhas = quebrar(valor || "—", largura, 9.5, normal);
    linhas.forEach((l, i) => texto(l, x, y - 11 - i * 11.5, 9.5));
    return 11 + linhas.length * 11.5;
  };
  const linhaDeCampos = (pares: [string, string][]) => {
    const w = (LARGURA - 12 * (pares.length - 1)) / pares.length;
    garantir(40);
    const alturas = pares.map(([r, v], i) => campo(r, v, M + i * (w + 12), w));
    y -= Math.max(...alturas) + 8;
  };
  const secao = (titulo: string) => {
    garantir(40);
    page.drawRectangle({ x: M, y: y - 4, width: LARGURA, height: 16, color: COR_FUNDO });
    texto(titulo, M + 6, y, 8.5, negrito);
    y -= 22;
  };

  secao("Identificação do treinamento");
  linhaDeCampos([["Título", d.titulo]]);
  linhaDeCampos([["Código", d.codigo], ["Tipo", d.tipo], ["Modalidade", d.modalidade], ["Formato", d.formato]]);
  linhaDeCampos([["Data da realização", d.dataRealizacao], ["Carga horária realizada", d.cargaRealizada], ["Responsável", d.responsavel], ["Instrutor", d.instrutor]]);
  if (d.local) linhaDeCampos([["Local", d.local]]);
  if (d.reposicao) linhaDeCampos([["Reposição", d.reposicao]]);
  if (d.documento) {
    secao("Documento controlado (revisão treinada)");
    linhaDeCampos([["Código do documento", d.documento.codigo], ["Revisão treinada", d.documento.revisao]]);
    linhaDeCampos([["Título do documento", d.documento.titulo]]);
  }

  // ── Participantes
  const presentes = d.participantes.filter((p) => p.situacao === "Presente").length;
  const ausentes = d.participantes.length - presentes;
  secao(`Participantes — turma prevista: ${d.participantes.length} · presentes: ${presentes} · ausentes: ${ausentes}`);
  const colunas: { rotulo: string; w: number; valor: (p: ParticipanteLista) => string }[] = [
    { rotulo: "Nome do colaborador", w: 140, valor: (p) => p.nome },
    { rotulo: "Cargo", w: 95, valor: (p) => p.cargo || "—" },
    { rotulo: "Departamento", w: 85, valor: (p) => p.departamento || "—" },
    { rotulo: "Situação", w: 46, valor: (p) => p.situacao },
    { rotulo: "Registro", w: 68, valor: (p) => p.forma },
    { rotulo: "Data/hora", w: LARGURA - 434, valor: (p) => (p.situacao === "Presente" ? (p.confirmadoEm ?? "—").replace(" às ", " ") : "—") },
  ];
  const cabecalhoTabela = () => {
    page.drawRectangle({ x: M, y: y - 4, width: LARGURA, height: 15, color: COR_FUNDO });
    let x = M + 4;
    for (const c of colunas) {
      texto(caber(c.rotulo, c.w - 6, 7.5, negrito), x, y, 7.5, negrito);
      x += c.w;
    }
    y -= 16;
  };
  cabecalhoTabela();
  d.participantes.forEach((p, i) => {
    if (y - 14 < M + 30) {
      novaPagina();
      cabecalhoTabela();
    }
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - 4, width: LARGURA, height: 14, color: rgb(0.985, 0.99, 0.995) });
    let x = M + 4;
    for (const c of colunas) {
      const ausente = p.situacao === "Ausente" && c.rotulo === "Situação";
      texto(caber(c.valor(p), c.w - 6, 8, ausente ? negrito : normal), x, y, 8, ausente ? negrito : normal, ausente ? COR_AUSENTE : COR_TEXTO);
      x += c.w;
    }
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: M + LARGURA, y: y - 4 }, thickness: 0.4, color: COR_LINHA });
    y -= 14;
  });
  y -= 8;

  // ── Registros manuais (quem registrou e por quê)
  const manuais = d.participantes.filter((p) => p.forma === "Registro manual" || (p.situacao === "Ausente" && (p.registradoPor || p.justificativa)));
  if (manuais.length) {
    secao("Registros manuais de presença");
    for (const p of manuais) {
      const linhas = quebrar(
        `${p.nome} — ${p.situacao.toLowerCase()}${p.registradoPor ? `, registrado por ${p.registradoPor}` : ""}${p.confirmadoEm ? ` em ${p.confirmadoEm}` : ""}${p.justificativa ? `. Justificativa: ${p.justificativa}` : ""}`,
        LARGURA - 8,
        8,
        normal,
      );
      garantir(linhas.length * 10.5 + 4);
      linhas.forEach((l, i) => texto(l, M + 4, y - i * 10.5, 8));
      y -= linhas.length * 10.5 + 4;
    }
  }

  if (d.versao > 1) {
    y -= 4;
    secao(`Versão ${d.versao}`);
    const linhas = quebrar(`Esta versão substitui a versão ${d.versao - 1}, que permanece preservada. Motivo: ${d.motivoVersao ?? "—"}`, LARGURA - 8, 8, normal);
    garantir(linhas.length * 10.5);
    linhas.forEach((l, i) => texto(l, M + 4, y - i * 10.5, 8));
    y -= linhas.length * 10.5;
  }

  // ── Rodapé em todas as páginas
  const paginas = pdf.getPages();
  paginas.forEach((pg, i) => {
    const rodape = `Lista de Presença ${d.codigo} · versão ${d.versao} · gerada em ${d.geradoEm} por ${d.geradoPor} · verificação ${d.codigoVerificacao}`;
    pg.drawLine({ start: { x: M, y: M + 14 }, end: { x: M + LARGURA, y: M + 14 }, thickness: 0.5, color: COR_LINHA });
    pg.drawText(caber(rodape, LARGURA - 70, 7, normal), { x: M, y: M + 4, size: 7, font: normal, color: COR_SUAVE });
    const num = `Página ${i + 1} de ${paginas.length}`;
    pg.drawText(num, { x: M + LARGURA - normal.widthOfTextAtSize(num, 7), y: M + 4, size: 7, font: normal, color: COR_SUAVE });
  });

  return pdf.save();
}
