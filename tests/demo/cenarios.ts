// Cenários de homologação (10) executados pela API REAL sobre o banco de demonstração. Cada passo registra o que se esperava e o que foi verificado.
import { porId, porToken, PESSOAS, type Demo } from "./banco.ts";

export interface Passo {
  cenario: number;
  descricao: string;
  esperado: string;
  ok: boolean;
  observado: string;
}
export interface Resultado {
  passos: Passo[];
  ids: Record<string, number>;
}

const diaSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const hoje = diaSP.format(new Date());
const maisDias = (n: number) => new Date(Date.parse(hoje + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const json = (x: unknown) => JSON.stringify(x);

export async function executarCenarios(d: Demo): Promise<Resultado> {
  const passos: Passo[] = [];
  const ids: Record<string, number> = {};
  let cen = 0;
  const passo = async (descricao: string, esperado: string, fn: () => Promise<string | void>) => {
    try {
      const obs = await fn();
      passos.push({ cenario: cen, descricao, esperado, ok: true, observado: obs ?? "conforme o esperado" });
    } catch (e) {
      passos.push({ cenario: cen, descricao, esperado, ok: false, observado: (e as Error).message });
    }
  };
  const espera = async (tok: string, acao: string, corpo: Record<string, unknown>, st: number) => {
    const r = await d.chamar(tok, acao, corpo);
    if (r.c !== st) throw new Error(`${tok} → ${acao}: esperado ${st}, veio ${r.c}: ${json(r.b).slice(0, 200)}`);
    return r.b?.dados;
  };
  const igual = (a: unknown, b: unknown, msg: string) => {
    if (json(a) !== json(b)) throw new Error(`${msg}: ${json(a)} ≠ ${json(b)}`);
  };
  const nome = (id: number) => porId(id).nome;
  const REF = "E-mail da liderança ao RH (homologação)";
  const cad = (extra: Record<string, unknown>) => ({ tipo: "capacitacao_tecnica", modalidade: "interno", formato: "presencial", data_inicio: hoje, ...extra });
  const part = async (tid: number, cid: number) => (await d.q(`select * from public.peopleflow_dev_participantes where treinamento_id=${tid} and colaborador_id=${cid}`))[0];
  const codigo = async (tid: number) => (await d.q(`select codigo from public.peopleflow_dev_treinamentos where id=${tid}`))[0].codigo as string;
  const visiveis = async (token: string) => {
    const uuid = porToken(token)!.uuid;
    await d.db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uuid}',false);`);
    try { return (await d.q("select id from public.peopleflow_dev_treinamentos order by id")).map((x) => Number(x.id)); } finally { await d.db.exec("reset role;"); }
  };
  const anexar = async (tok: string, tid: number, tipo: string, arq: string) => {
    const u = await espera(tok, "evidencia_upload_url", { treinamento_id: tid, tipo, file_name: arq, mime: "application/pdf", tamanho_bytes: 1500 }, 200);
    d.fake.storage.from("desenvolvimento-evidencias")._simularUpload(u.path, 1500, "application/pdf");
    return espera(tok, "evidencia_registrar", { treinamento_id: tid, path: u.path, tipo, file_name: arq }, 200);
  };
  const qrConfirma = async (tok: string, tid: number, quem: string[]) => {
    const qr = (await espera(tok, "qr_gerar", { treinamento_id: tid }, 200)).token;
    for (const p of quem) await espera(p, "presenca_confirmar", { token: qr }, 200);
  };

  // ── Preparação: registro HISTÓRICO (anterior ao novo fluxo) para o cenário 7 ──────────────────────────────────────
  cen = 0;
  await passo("Preparação: treinamento histórico concluído, com um ausente SEM encaminhamento (como os registros anteriores a esta entrega) e um externo concluído sem evidência", "Registros históricos existem para o cenário 7", async () => {
    for (const t of ["rh", "bia", "gustavo"]) await espera(t, "sessao", {}, 200);
    const h = (await espera("rh", "treinamento_salvar", cad({ titulo: "Integração de novos colaboradores (2025)", tipo: "integracao", responsavel_colaborador_id: 1 }), 200)).id;
    ids.historico = h;
    await espera("rh", "participantes_adicionar", { treinamento_id: h, colaborador_ids: [5, 8, 9] }, 200);
    await espera("rh", "treinamento_iniciar", { id: h }, 200);
    await espera("rh", "presenca_manual", { treinamento_id: h, participante_ids: [(await part(h, 5)).id, (await part(h, 8)).id, (await part(h, 9)).id], presenca: "presente", motivo: "Lista física" }, 200);
    await espera("rh", "treinamento_concluir", { id: h }, 200);
    await d.db.exec(`update public.peopleflow_dev_participantes set presenca_status='ausente', presenca_motivo='Registro histórico: faltou', ausencia_justificativa=null, ausencia_encaminhamento=null where id=${(await part(h, 9)).id}`);
    const x = (await espera("rh", "treinamento_salvar", cad({ titulo: "Curso externo de metrologia (2025)", modalidade: "externo", responsavel_colaborador_id: 1 }), 200)).id;
    ids.historicoExterno = x;
    await espera("rh", "participantes_adicionar", { treinamento_id: x, colaborador_ids: [5] }, 200);
    await espera("rh", "presenca_manual", { treinamento_id: x, participante_ids: [(await part(x, 5)).id], presenca: "presente", motivo: "Certificado" }, 200);
    await espera("rh", "treinamento_realizacao", { id: x, data_realizacao: maisDias(-30), carga_realizada_min: 240 }, 200);
    await anexar("rh", x, "certificado", "certificado-metrologia.pdf");
    await espera("rh", "treinamento_concluir", { id: x }, 200);
    await d.db.exec(`update public.peopleflow_dev_evidencias set substituida_em=now() where treinamento_id=${x} and tipo='certificado'`);
  });

  // ── 1. RH habilita um colaborador e, separadamente, um gestor ─────────────────────────────────────────────────────
  cen = 1;
  const sondas = ["necessidade_registrar", "habilidade_ativo", "habilitacao_opcoes", "reacao_resumo", "lista_mestra_salvar"] as const;
  const corpoSonda = (acao: string, alvo: number) => (acao === "necessidade_registrar" ? { colaborador_id: alvo, descricao: "Necessidade de teste (homologação)", categoria: "tecnica", justificativa: "Teste da permissão" } : acao === "habilidade_ativo" ? { id: 1, ativo: false, motivo: "x" } : acao === "lista_mestra_salvar" ? { codigo: "X-1", titulo: "x", revisao_atual: "01", novo: true } : {});
  const antesGustavo: Record<string, number> = {};
  await passo("Antes: Manuela não abre o módulo; Gustavo (gestor) abre como Gestor e JÁ é autorizado a registrar treinamentos, sem habilitação do RH", "Manuela 403; Gustavo perfil Gestor, habilitado=true (perfil + escopo de liderança) e nenhuma habilitação criada", async () => {
    if ((await d.chamar("manuela", "sessao")).c !== 403) throw new Error("Manuela deveria estar sem acesso");
    const g = await d.chamar("gustavo", "sessao");
    if (g.b.perfil !== "Gestor" || g.b.habilitado !== true || g.b.podeRegistrar !== true) throw new Error(json(g.b));
    if ((await d.q("select count(*)::int n from public.peopleflow_dev_responsaveis_gestao"))[0].n !== 0) throw new Error("o gestor não depende de habilitação");
    for (const a of sondas) antesGustavo[a] = (await d.chamar("gustavo", a, corpoSonda(a, 8))).c;
    return `Gustavo registra e administra a área dele sem habilitação; nos outros módulos: ${json(antesGustavo)}`;
  });
  await passo("Beatriz (gestora) SOLICITA a habilitação de Manuela com justificativa; o RH é avisado por e-mail; a solicitação fica Pendente e ainda não vale", "Solicitação pendente; e-mail ao RH com colaborador, gestora, área, justificativa e link; Manuela segue sem acesso; pedido duplicado recusado", async () => {
    const r = await espera("bia", "habilitacao_solicitar", { colaborador_id: 3, justificativa: "Manuela conduz as sessões de Garantia da Qualidade e precisa registrar e concluir treinamentos." }, 200);
    ids.solicitacaoManuela = r.id;
    await espera("bia", "habilitacao_solicitar", { colaborador_id: 3, justificativa: "de novo" }, 409);
    await espera("gustavo", "habilitacao_solicitar", { colaborador_id: 3, justificativa: "não é da minha equipe" }, 403);
    if (d.emails.length !== 1 || !/^ana\./i.test(d.emails[0].to)) throw new Error("e-mail ao RH (Ana): " + json(d.emails));
    for (const x of ["Manuela Castro", "Beatriz Gomes", "Qualidade", "Garantia da Qualidade", "/desenvolvimento/treinamentos/pendencias"]) if (!d.emails[0].text.includes(x)) throw new Error(`o e-mail não traz "${x}"`);
    if ((await d.chamar("manuela", "sessao")).c !== 403) throw new Error("antes da aprovação Manuela não tem acesso");
    return `Pendente (nº ${r.id}); e-mail enviado ao RH: "${d.emails[0].subject}"; duplicidade e equipe alheia recusadas`;
  });
  await passo("O RH aprova a solicitação em Pendências (autor, data, justificativa); só então Manuela é habilitada, com a gestão de Beatriz", "Habilitação ativa criada pela aprovação; solicitação aprovada com decisor e data", async () => {
    const pend = (await espera("rh", "habilitacao_solicitacoes_listar", {}, 200)).filter((x: any) => x.status === "pendente");
    igual(pend.map((x: any) => x.colaborador.nome), ["Manuela Castro"], "pendentes do RH");
    await espera("rh", "habilitacao_solicitacao_decidir", { id: ids.solicitacaoManuela, decisao: "aprovar", justificativa: "De acordo com a liderança." }, 200);
    const l = await espera("rh", "habilitacao_listar", {}, 200);
    const mm = l.find((x: any) => x.colaborador.id === 3);
    if (!mm?.ativa || mm.gestao.nome !== "Beatriz Gomes" || mm.habilitado_por !== "Ana Ribeiro" || !mm.habilitado_em || !/^Solicitação nº/.test(mm.referencia)) throw new Error(json(mm));
    const s = (await espera("bia", "habilitacao_solicitacoes_listar", {}, 200))[0];
    if (s.status !== "aprovada" || s.decisor !== "Ana Ribeiro") throw new Error(json(s));
    return "Manuela habilitada (gestão Beatriz) pela aprovação; a decisão aparece para a Beatriz e para o RH";
  });
  await passo("Permissões nos demais módulos NÃO mudam: Gustavo (autorizado pelo perfil) e Manuela (habilitada) só ganham os Treinamentos", "Gustavo: mesmos resultados; Manuela: tudo fora dos Treinamentos recusado", async () => {
    const depois: Record<string, number> = {};
    for (const a of sondas) depois[a] = (await d.chamar("gustavo", a, corpoSonda(a, 8))).c;
    igual(depois, antesGustavo, "ações do Gustavo");
    const m = await d.chamar("manuela", "sessao");
    if (m.b.perfil !== "Responsavel" || m.b.habilitado !== true) throw new Error(json(m.b));
    const manu: Record<string, number> = {};
    for (const a of sondas) manu[a] = (await d.chamar("manuela", a, corpoSonda(a, 5))).c;
    if (Object.values(manu).some((c) => c !== 403)) throw new Error("Manuela deveria ser recusada: " + json(manu));
    const mods = await d.q("select user_id::text u, count(*)::int n from public.module_access where user_id in ('" + porToken("gustavo")!.uuid + "','" + porToken("manuela")!.uuid + "') group by 1");
    if (mods.some((x) => x.n !== 2)) throw new Error("módulos de acesso inalterados: " + json(mods));
    return `Gustavo: ${json(depois)} · Manuela: ${json(manu)} · acessos a módulos inalterados (2 cada)`;
  });
  await passo("Colaboradora com menos de seis meses e sem conta (Camila): o RH habilita criando SOMENTE o acesso ao PeopleFlow", "Pede confirmação explícita; conta criada só com o módulo peopleflow (sem SST)", async () => {
    await espera("rh", "habilitacao_conceder", { colaborador_id: 10, gestor_colaborador_id: 2, referencia: REF }, 422);
    const r = await espera("rh", "habilitacao_conceder", { colaborador_id: 10, gestor_colaborador_id: 2, referencia: REF + " — recém-contratada", criar_acesso: true }, 200);
    if (r.acesso !== "criado") throw new Error(json(r));
    const mods = await d.q("select modulo from public.module_access where concedido_por='habilitacao-treinamentos'");
    igual(mods, [{ modulo: "peopleflow" }], "módulos concedidos");
    return "Conta criada com o módulo peopleflow apenas; o acesso do SST não foi concedido";
  });

  // ── 2. Colaborador habilitado registra com outro habilitado como instrutor ───────────────────────────────────────
  cen = 2;
  await passo("O RH habilita Juliana; Manuela registra o treinamento da Garantia da Qualidade com Juliana como instrutora interna", "Treinamento planejado: responsável Manuela, instrutora Juliana, ambas identificadas", async () => {
    await espera("rh", "habilitacao_conceder", { colaborador_id: 4, gestor_colaborador_id: 2, referencia: REF }, 200);
    await espera("juliana", "sessao", {}, 200); // ao entrar no portal, a sessão do módulo se abre sozinha
    await espera("manuela", "treinamento_salvar", cad({ titulo: "Garantia da Qualidade — controle de pesagem", responsavel_colaborador_id: 4 }), 422); // registrar só para outra pessoa
    const t = await espera("manuela", "treinamento_salvar", cad({ titulo: "Garantia da Qualidade — controle de pesagem", carga_horaria_min: 90, justificativa: "Atualização do controle de pesagem de insumos", responsavel_colaborador_id: 3, instrutor_colaborador_id: 4 }), 200);
    ids.sessao = t.id;
    igual([t.status, Number(t.solicitado_por_colaborador_id), Number(t.responsavel_colaborador_id), Number(t.instrutor_colaborador_id)], ["planejado", 3, 3, 4], "registro");
    const vis = { manuela: await visiveis("manuela"), juliana: await visiveis("juliana"), davi: await visiveis("davi") };
    if (!vis.manuela.includes(t.id) || !vis.juliana.includes(t.id) || vis.davi.includes(t.id)) throw new Error("visão: " + json(vis));
    return `${t.codigo}: Manuela (responsável) e Juliana (instrutora) enxergam; Davi (outra área) não`;
  });

  // ── 3 + 5. Administração compartilhada, identificação de quem fez cada ação, ausência e conclusão ──────────────────
  cen = 3;
  await passo("Manuela monta a turma e inicia; Juliana gera o QR, registra presença manual, atualiza a realização; Manuela anexa a ata; participante confirma pelo QR", "As duas administram; nenhum terceiro consegue", async () => {
    const s = ids.sessao;
    await espera("manuela", "participantes_adicionar", { treinamento_id: s, colaborador_ids: [5, 6, 12, 10] }, 200);
    await espera("manuela", "treinamento_iniciar", { id: s }, 200);
    await espera("juliana", "treinamento_realizacao", { id: s, carga_realizada_min: 90 }, 200);
    await qrConfirma("juliana", s, ["paulo"]);
    await espera("juliana", "presenca_manual", { treinamento_id: s, participante_ids: [(await part(s, 10)).id], presenca: "presente", motivo: "Sem acesso ao celular: lista física" }, 200);
    await anexar("manuela", s, "ata", "ata-da-sessao.pdf");
    await espera("gustavo", "qr_gerar", { treinamento_id: s }, 403); // gestor de OUTRA área
    await espera("bia", "qr_gerar", { treinamento_id: s }, 200); // a gestora da ÁREA administra o treinamento, sem habilitação
    await espera("davi", "qr_gerar", { treinamento_id: s }, 401); // Davi nem abre o módulo ainda
    return "Manuela e Juliana fizeram o ciclo; Beatriz (gestora da área) também administra e Gustavo (outra área) recebe 403; Davi (sem habilitação) nem abre o módulo";
  });
  cen = 5;
  await passo("Renata e Rafael ficam ausentes: Manuela registra a ausência; sem encaminhamento a sessão NÃO conclui e a conferência explica o motivo", "Impedimento: ausentes sem encaminhamento", async () => {
    const s = ids.sessao;
    await espera("manuela", "presenca_manual", { treinamento_id: s, participante_ids: [(await part(s, 6)).id], presenca: "ausente", motivo: "Afastamento programado" }, 200);
    await espera("manuela", "presenca_manual", { treinamento_id: s, participante_ids: [(await part(s, 12)).id], presenca: "ausente", motivo: "Viagem a trabalho" }, 200);
    const c = await espera("manuela", "treinamento_conferir", { id: s }, 200);
    igual(c.impedimentos.map((i: any) => i.codigo), ["ausencia_sem_encaminhamento"], "impedimentos");
    const r = await d.chamar("manuela", "treinamento_concluir", { id: s });
    if (r.c !== 422 || !/encaminhamento/.test(r.b.error)) throw new Error(json(r));
    await espera("manuela", "ausencia_encaminhar", { participante_id: (await part(s, 6)).id, justificativa: "Afastamento programado até o dia 20", encaminhamento: "reposicao", reposicao_prevista_em: maisDias(10) }, 200);
    await espera("manuela", "ausencia_encaminhar", { participante_id: (await part(s, 12)).id, justificativa: "Viagem a trabalho", encaminhamento: "reposicao" }, 200);
    await espera("manuela", "ausencia_encaminhar", { participante_id: (await part(s, 6)).id, justificativa: "x", encaminhamento: "dispensa" }, 403); // dispensa é do RH
    return `Mensagem do servidor: "${r.b.error}"`;
  });
  await passo("Com as ausências justificadas e encaminhadas, a conferência libera; JULIANA (instrutora) conclui a sessão original", "Concluída por Juliana; as 2 reposições seguem pendentes e a reação não se confunde com a conclusão", async () => {
    const s = ids.sessao;
    const c = await espera("juliana", "treinamento_conferir", { id: s }, 200);
    if (!c.pode_concluir || !c.pendencias_apos.some((i: any) => i.codigo === "reposicao_pendente") || !c.pendencias_apos.some((i: any) => i.codigo === "reacao_pendente")) throw new Error(json(c));
    await espera("juliana", "treinamento_concluir", { id: s }, 200);
    const t = (await d.q(`select status, concluido_por from public.peopleflow_dev_treinamentos where id=${s}`))[0];
    if (t.status !== "concluido" || t.concluido_por !== porToken("juliana")!.uuid) throw new Error(json(t));
    const aus = await d.q(`select colaborador_id, presenca_status, ausencia_encaminhamento from public.peopleflow_dev_participantes where treinamento_id=${s} and presenca_status='ausente' order by 1`);
    igual(aus.map((x) => [Number(x.colaborador_id), x.ausencia_encaminhamento]), [[6, "reposicao"], [12, "reposicao"]], "ausentes seguem pendentes");
    return `Sessão concluída por Juliana; pendências após a conclusão: ${c.pendencias_apos.map((i: any) => i.mensagem).join(" | ")}`;
  });
  cen = 3;
  await passo("Identificação de quem realizou cada ação (Histórico de ações da sessão), visível ao RH, ao responsável, à instrutora e à gestora que acompanha", "Cada ação com o nome do autor; o participante aparece como autor da própria confirmação por QR", async () => {
    const h = await espera("rh", "treinamento_historico", { treinamento_id: ids.sessao }, 200);
    const por = (rotulo: string) => h.filter((e: any) => e.rotulo === rotulo).map((e: any) => e.por);
    const esperado: [string, string[]][] = [
      ["Treinamento registrado", ["Manuela Castro"]], ["Participantes incluídos", ["Manuela Castro"]], ["Realização iniciada", ["Manuela Castro"]],
      ["Dados da realização atualizados", ["Juliana Prado"]], ["QR de presença gerado", ["Juliana Prado"]], ["Presença confirmada pelo próprio participante (QR)", ["Paulo Neves"]],
      ["Evidência anexada", ["Manuela Castro"]], ["Sessão concluída", ["Juliana Prado"]],
    ];
    for (const [r, p] of esperado) igual(por(r), p, `autor de "${r}"`);
    igual(por("Presença registrada manualmente"), ["Juliana Prado", "Manuela Castro", "Manuela Castro"], "presenças manuais");
    for (const tok of ["manuela", "juliana", "bia"]) if ((await espera(tok, "treinamento_historico", { treinamento_id: ids.sessao }, 200)).length < 10) throw new Error(tok + " deveria ver o histórico");
    await espera("davi", "treinamento_historico", { treinamento_id: ids.sessao }, 401);
    return `${h.length} ações registradas, cada uma com autor e horário`;
  });

  // ── 4. Instrutor externo (sem login) + 8. Reação ────────────────────────────────────────────────────────────────
  cen = 4;
  await passo("Manuela registra o treinamento com palestrante EXTERNO (João da Silva); conduz e conclui sem que ele tenha login", "Instrutor externo é só um nome; nenhuma conta criada para ele; Manuela administra e conclui", async () => {
    const contasAntes = (await d.q("select count(*)::int n from auth.users"))[0].n;
    const t = await espera("manuela", "treinamento_salvar", cad({ titulo: "Calibração de balanças — palestra do fornecedor", responsavel_colaborador_id: 3, instrutor_externo: "João da Silva (Metrologia Sul)" }), 200);
    ids.externo = t.id;
    igual([t.instrutor_externo, t.instrutor_colaborador_id], ["João da Silva (Metrologia Sul)", null], "instrutor externo nominal");
    await espera("manuela", "participantes_adicionar", { treinamento_id: t.id, colaborador_ids: [5, 6, 12, 9] }, 200);
    await espera("manuela", "treinamento_iniciar", { id: t.id }, 200);
    await qrConfirma("manuela", t.id, ["paulo", "renata", "rafael", "sergio"]);
    await espera("manuela", "treinamento_concluir", { id: t.id }, 200);
    if ((await d.q("select count(*)::int n from auth.users"))[0].n !== contasAntes) throw new Error("nenhuma conta deveria ser criada");
    const lista = await d.q(`select count(*)::int n from public.peopleflow_dev_evidencias where treinamento_id=${t.id} and tipo='lista_presenca'`);
    if (lista[0].n !== 1) throw new Error("lista de presença gerada na conclusão");
    return "João não é colaborador nem tem conta; a lista de presença foi gerada com o nome dele como instrutor";
  });
  cen = 8;
  await passo("Avaliação de Reação do treinamento externo-palestrante: 1ª e 2ª respostas NÃO mostram média; a 3ª mostra médias consolidadas; ninguém vê nota individual", "Responsável, gestora e RH acompanham quem respondeu; anonimato e regra de 3 preservados; Juliana/Davi sem acesso", async () => {
    const t = ids.externo;
    const cod = await codigo(t);
    const respostas: [string, number[]][] = [["paulo", [5, 5, 5, 5, 5]], ["renata", [1, 2, 3, 4, 5]], ["rafael", [3, 3, 4, 2, 1]]];
    const log: string[] = [];
    for (let i = 0; i < 3; i++) {
      for (const tok of ["rh", "manuela", "bia"]) {
        const det = await espera(tok, "reacao_detalhe", { treinamento_id: t }, 200);
        if (det.respondidos !== i || det.medias !== null || /"respostas"|"nota"|"q[1-5]"/.test(json(det))) throw new Error(`${tok}: com ${i} resposta(s) não há média/nota`);
      }
      await espera(respostas[i][0], "reacao_responder", { codigo: cod, respostas: respostas[i][1] }, 200);
      log.push(`${i + 1} resposta(s): sem média`);
    }
    for (const tok of ["rh", "manuela", "bia"]) {
      const det = await espera(tok, "reacao_detalhe", { treinamento_id: t }, 200);
      igual(det.medias, [3, 3.3, 4, 3.7, 3.7], `${tok}: médias consolidadas`);
    }
    await espera("juliana", "reacao_detalhe", { treinamento_id: t }, 403); // habilitada, mas não vinculada a este treinamento
    await espera("davi", "reacao_detalhe", { treinamento_id: t }, 401); // Davi ainda não tem habilitação
    await espera("manuela", "reacao_resumo", {}, 403);
    return `${log.join(" · ")} · com 3: médias [3, 3,3, 4, 3,7, 3,7] para RH, Manuela e Beatriz`;
  });

  // ── 6. Reposição pendente e regularização ───────────────────────────────────────────────────────────────────────
  cen = 6;
  await passo("Acompanhamento: Renata e Rafael aparecem como reposição a programar (com a data prevista de Renata) para o RH, Manuela, Juliana e Beatriz", "A sessão está concluída, mas os participantes seguem pendentes", async () => {
    const out: string[] = [];
    for (const tok of ["rh", "manuela", "juliana", "bia"]) {
      const p = (await espera(tok, "pendencias_listar", {}, 200)).reposicoes.filter((r: any) => r.treinamento_id === ids.sessao);
      igual(p.map((r: any) => `${r.colaborador_id}:${r.situacao}`).sort(), ["12:a_programar", "6:a_programar"], `${tok} vê as pendências`);
      out.push(tok);
    }
    const renata = (await espera("rh", "pendencias_listar", {}, 200)).reposicoes.find((r: any) => r.colaborador_id === 6);
    if (renata.prevista_em !== maisDias(10) || renata.justificativa !== "Afastamento programado até o dia 20") throw new Error(json(renata));
    return `Vista por ${out.join(", ")}`;
  });
  await passo("Manuela programa a reposição de Renata; depois a executa; Renata confirma por QR e a reposição é concluída", "Renata sai das pendências; no original continua ausente; Rafael segue pendente", async () => {
    const rep = await espera("manuela", "treinamento_reposicao", { treinamento_id: ids.sessao, tipo: "capacitacao_tecnica", modalidade: "interno", responsavel_colaborador_id: 3, instrutor_colaborador_id: 4, data_inicio: maisDias(10), colaborador_ids: [6] }, 200);
    ids.reposicao = rep.id;
    const prog = (await espera("rh", "pendencias_listar", {}, 200)).reposicoes.find((r: any) => r.colaborador_id === 6);
    igual([prog.situacao, prog.reposicao?.id], ["programada", rep.id], "reposição programada");
    await espera("manuela", "treinamento_iniciar", { id: rep.id }, 200);
    await qrConfirma("juliana", rep.id, ["renata"]);
    await espera("manuela", "treinamento_concluir", { id: rep.id }, 200);
    const resto = (await espera("rh", "pendencias_listar", {}, 200)).reposicoes.filter((r: any) => r.treinamento_id === ids.sessao);
    igual(resto.map((r: any) => r.colaborador_id), [12], "só Rafael segue pendente");
    const orig = await part(ids.sessao, 6);
    if (orig.presenca_status !== "ausente") throw new Error("a sessão original não pode ser descaracterizada");
    const st = (await d.q(`select status from public.peopleflow_dev_treinamentos where id=${ids.sessao}`))[0].status;
    if (st !== "concluido") throw new Error("o original não é reaberto");
    return `Reposição ${rep.codigo} concluída; Renata regularizada; no original continua "ausente" (histórico preservado)`;
  });

  // ── 7. Pendências: históricos e distinção sessão × participante ─────────────────────────────────────────────────
  cen = 7;
  await passo("O RH vê, em Pendências, o registro HISTÓRICO sem encaminhamento, o externo sem evidência e a reposição de Rafael ainda a programar", "Sessão concluída ≠ participante pendente: o treinamento está Concluído e o participante aparece pendente", async () => {
    const p = await espera("rh", "pendencias_listar", {}, 200);
    const hist = p.reposicoes.find((r: any) => r.treinamento_id === ids.historico);
    if (hist?.situacao !== "sem_encaminhamento" || hist.colaborador_id !== 9) throw new Error("histórico sem encaminhamento: " + json(hist));
    const ext = p.inconsistencias.find((i: any) => i.treinamento_id === ids.historicoExterno);
    if (ext?.motivo !== "externo_sem_evidencia") throw new Error("externo sem evidência: " + json(p.inconsistencias));
    const raf = p.reposicoes.find((r: any) => r.colaborador_id === 12);
    if (raf?.situacao !== "a_programar") throw new Error(json(raf));
    const st = (await d.q(`select status from public.peopleflow_dev_treinamentos where id in (${ids.historico}, ${ids.sessao})`)).map((x) => x.status);
    if (st.some((s) => s !== "concluido")) throw new Error("as sessões estão concluídas");
    return `${p.reposicoes.length} reposição(ões) pendente(s) [${p.reposicoes.map((r: any) => `${r.nome}: ${r.situacao}`).join(" · ")}] · ${p.inconsistencias.length} registro(s) inconsistente(s) · as sessões de origem estão CONCLUÍDAS`;
  });
  await passo("RH dispensa a ausência histórica de Sérgio (com justificativa): sai da fila sem apagar o participante", "Pendência encerrada pela dispensa, registro preservado", async () => {
    const pid = (await part(ids.historico, 9)).id;
    await espera("rh", "ausencia_encaminhar", { participante_id: pid, justificativa: "Saiu do turno antes da integração; conteúdo coberto na integração seguinte", encaminhamento: "dispensa" }, 200);
    const p = await espera("rh", "pendencias_listar", {}, 200);
    if (p.reposicoes.some((r: any) => r.treinamento_id === ids.historico)) throw new Error("a dispensa encerra a pendência");
    const reg = (await d.q(`select presenca_status, removido_em, ausencia_encaminhamento, dispensado_por from public.peopleflow_dev_participantes where id=${pid}`))[0];
    igual([reg.presenca_status, reg.removido_em, reg.ausencia_encaminhamento, reg.dispensado_por], ["ausente", null, "dispensa", porToken("rh")!.uuid], "registro");
    return "Dispensado pelo RH; participante e ausência preservados";
  });

  // ── 9. Visão do gestor restrita à área; visão geral do RH ───────────────────────────────────────────────────────
  cen = 10;
  await passo("Davi (habilitado, Logística) registra treinamentos próprios — um concluído e um pendente — para o cenário de revogação", "Treinamentos de Davi existem", async () => {
    await espera("rh", "habilitacao_conceder", { colaborador_id: 8, gestor_colaborador_id: 7, referencia: REF }, 200);
    await espera("davi", "sessao", {}, 200);
    const a = await espera("davi", "treinamento_salvar", cad({ tipo: "novo_pop", titulo: "x", lista_mestra_codigo: "IT-LOG-005", responsavel_colaborador_id: 8 }), 200);
    ids.davi1 = a.id;
    await espera("davi", "participantes_adicionar", { treinamento_id: a.id, colaborador_ids: [9] }, 200);
    await espera("davi", "treinamento_iniciar", { id: a.id }, 200);
    await qrConfirma("davi", a.id, ["sergio"]);
    await espera("davi", "treinamento_concluir", { id: a.id }, 200);
    const b = await espera("davi", "treinamento_salvar", cad({ titulo: "Conferência de lotes na doca", responsavel_colaborador_id: 8 }), 200);
    ids.davi2 = b.id;
    await espera("davi", "participantes_adicionar", { treinamento_id: b.id, colaborador_ids: [9] }, 200);
    return `${a.codigo} (concluído) e ${b.codigo} (planejado)`;
  });
  cen = 9;
  await passo("Visão do gestor restrita à sua área e visão geral do RH", "Beatriz vê a Qualidade; Gustavo vê a Logística (e treinamentos com gente da equipe dele); RH vê tudo", async () => {
    const v = { rh: await visiveis("rh"), bia: await visiveis("bia"), gustavo: await visiveis("gustavo"), davi: await visiveis("davi"), manuela: await visiveis("manuela") };
    const todos = [ids.historico, ids.historicoExterno, ids.sessao, ids.externo, ids.reposicao, ids.davi1, ids.davi2];
    if (!todos.every((x) => v.rh.includes(x))) throw new Error("RH vê tudo: " + json(v.rh));
    if (!v.bia.includes(ids.sessao) || !v.bia.includes(ids.externo) || v.bia.includes(ids.davi1) || v.bia.includes(ids.davi2)) throw new Error("Beatriz: " + json(v.bia));
    if (!v.gustavo.includes(ids.davi1) || !v.gustavo.includes(ids.davi2) || v.gustavo.includes(ids.sessao) || v.gustavo.includes(ids.reposicao)) throw new Error("Gustavo: " + json(v.gustavo));
    if (v.davi.some((x) => [ids.sessao, ids.externo].includes(x)) || !v.davi.includes(ids.davi1)) throw new Error("Davi: " + json(v.davi));
    const pb = (await espera("bia", "pendencias_listar", {}, 200)).reposicoes.map((r: any) => r.nome);
    const pg = (await espera("gustavo", "pendencias_listar", {}, 200)).reposicoes.map((r: any) => r.nome);
    return `Beatriz vê ${v.bia.length} treinamento(s) (Qualidade; sem os de Davi) e pendências de [${pb.join(", ")}]; Gustavo vê ${v.gustavo.length} (Logística + a palestra, onde Sérgio participa; sem a sessão da Qualidade) e pendências de [${pg.join(", ")}]; RH vê ${v.rh.length}`;
  });

  // ── 10. Revogação e transferência ───────────────────────────────────────────────────────────────────────────────
  cen = 10;
  await passo("RH revoga a habilitação de Davi (com motivo): poderes encerram na hora, o concluído fica íntegro, aparece a lista de pendentes", "Pendente listado; concluído e evidências intactos; Davi mantém Meus treinamentos", async () => {
    const hab = (await espera("rh", "habilitacao_listar", {}, 200)).find((x: any) => x.colaborador.id === 8 && x.ativa);
    const antes = (await d.q(`select md5(t::text) h from public.peopleflow_dev_treinamentos t where id=${ids.davi1}`))[0].h;
    const rev = await espera("rh", "habilitacao_revogar", { id: hab.id, motivo: "Mudança de responsabilidade na Logística" }, 200);
    igual(rev.pendentes.map((p: any) => p.id), [ids.davi2], "pendentes");
    await espera("davi", "participantes_adicionar", { treinamento_id: ids.davi2, colaborador_ids: [9] }, 401); // a sessão do módulo caiu
    if ((await d.chamar("davi", "sessao")).c !== 403) throw new Error("sem habilitação não abre o módulo");
    if ((await visiveis("davi")).length !== 0) throw new Error("sem habilitação nada é lido pelo módulo");
    if ((await d.q(`select md5(t::text) h from public.peopleflow_dev_treinamentos t where id=${ids.davi1}`))[0].h !== antes) throw new Error("o concluído permanece íntegro");
    const mine = await espera("davi", "meu_historico", {}, 200);
    if (!mine.treinamentos.length) throw new Error("Meus treinamentos segue funcionando");
    return `Pendente de transferir: ${rev.pendentes[0].codigo}; treinamento concluído intacto; Davi segue vendo as próprias participações`;
  });
  await passo("RH transfere o treinamento pendente para Gustavo (gestor, elegível como responsável), com motivo; tenta transferir para quem não é habilitado e para um concluído", "Transferência registrada com histórico; as inválidas são recusadas; quem registrou não muda", async () => {
    const T = (extra: Record<string, unknown>) => ({ treinamento_id: ids.davi2, para_colaborador_id: 7, motivo_tipo: "revogacao", motivo: "Revogação da habilitação do responsável anterior", ...extra });
    await espera("rh", "treinamento_transferir", T({ para_colaborador_id: 9 }), 422);
    await espera("rh", "treinamento_transferir", T({ treinamento_id: ids.davi1 }), 422);
    await espera("rh", "treinamento_transferir", T({ motivo: " " }), 422);
    await espera("bia", "treinamento_transferir", T({}), 403);
    const nova = await espera("rh", "treinamento_transferir", T({}), 200);
    igual([Number(nova.responsavel_colaborador_id), Number(nova.solicitado_por_colaborador_id)], [7, 8], "novo responsável; quem registrou permanece");
    const h = await espera("rh", "transferencias_listar", { treinamento_id: ids.davi2 }, 200);
    igual([h[0].de, h[0].para, h[0].por, h[0].motivo_tipo], ["Davi Moura", "Gustavo Reis", "Ana Ribeiro", "revogacao"], "histórico da transferência");
    await espera("gustavo", "treinamento_conferir", { id: ids.davi2 }, 200); // Gustavo, gestor e agora responsável, administra
    const hist = await espera("gustavo", "treinamento_historico", { treinamento_id: ids.davi2 }, 200);
    if (!hist.some((e: any) => e.rotulo === "Responsabilidade transferida pelo RH")) throw new Error("a transferência aparece no histórico");
    const l = (await espera("rh", "habilitacao_listar", {}, 200)).find((x: any) => x.colaborador.id === 8);
    if (l.ativa || l.revogado_motivo !== "Mudança de responsabilidade na Logística" || l.revogado_por !== "Ana Ribeiro") throw new Error("histórico da revogação: " + json(l));
    return "Transferido de Davi para Gustavo; histórico da transferência e da revogação preservados";
  });

  void PESSOAS; void nome;
  return { passos, ids };
}
