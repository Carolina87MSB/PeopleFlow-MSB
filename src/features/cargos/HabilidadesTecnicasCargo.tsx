import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { usePortalData } from "../../store/usePortalData";
import { gravar, iniciarSessao } from "../desenvolvimento/devRepository";
import { buscarHabilidades, mesmoNome, possiveisCorrespondencias, type ItemCatalogo } from "../desenvolvimento/buscaHabilidades";
import base from "./DescricaoCargoModal.module.css";
import styles from "./HabilidadesTecnicasCargo.module.css";

interface Selecionada {
  id: number;
  habilidade_id: number | null;
  nome: string;
  status: "vigente" | "sugerido";
  nova: boolean;
  descricao: string;
  sugerido_por_colaborador_id: number | null;
}
interface Dados {
  selecionadas: Selecionada[];
  catalogo: (ItemCatalogo & { descricao: string })[];
  sugestoes_pendentes: { cargo: string; nome: string }[];
}

async function lerDados(cargoNome: string): Promise<Dados> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/desenvolvimento?acao=dc_habilidades_listar", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify({ cargo_nome: cargoNome }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; dados?: Dados };
  if (!res.ok || !body.dados) throw new Error(body.error ?? `Falha ao carregar (${res.status}).`);
  return body.dados;
}

/** Habilidades Técnicas da Descrição de Cargo, referenciando o Catálogo de Habilidades Técnicas
 * (Desenvolvimento > Habilidades e Requisitos). RH seleciona/cadastra; Gestor seleciona e sugere —
 * o RH valida. O texto livre anterior continua gravado e visível (somente leitura). */
export default function HabilidadesTecnicasCargo({ cargoNome, textoLegado, textoPendente, podeEditar }: { cargoNome: string; textoLegado: string; textoPendente?: string; podeEditar: boolean }) {
  const { perfil } = usePortalData();
  const ehRH = perfil === "RH";
  const operacional = podeEditar && (perfil === "RH" || perfil === "Gestor");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [versao, setVersao] = useState(0);
  const [minhaColaboradorId, setMinhaColaboradorId] = useState<number | null>(null);

  // Quem pode editar precisa saber quais sugestões são dele (Gestor só retira as próprias).
  useEffect(() => {
    if (!operacional) return;
    iniciarSessao()
      .then((s) => s.instalado && setMinhaColaboradorId(s.colaboradorId))
      .catch(() => undefined);
  }, [operacional]);

  useEffect(() => {
    let vivo = true;
    lerDados(cargoNome)
      .then((d) => vivo && setDados(d))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [cargoNome, versao]);

  const idsNoCargo = useMemo(() => new Set((dados?.selecionadas ?? []).map((s) => s.habilidade_id).filter(Boolean)), [dados]);
  const opcoes = useMemo(() => buscarHabilidades((dados?.catalogo ?? []).filter((h) => !idsNoCargo.has(h.id)), busca).slice(0, 12), [dados, busca, idsNoCargo]);

  // A escrita usa a sessão do módulo Desenvolvimento (perfil e equipe derivados pelo servidor).
  async function comSessao<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setErro(null);
    setOcupado(true);
    try {
      const s = await iniciarSessao();
      if (s.instalado) setMinhaColaboradorId(s.colaboradorId);
      const r = await fn();
      setVersao((v) => v + 1);
      return r;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setOcupado(false);
    }
  }

  const adicionar = (habilidadeId: number) =>
    comSessao(async () => {
      await gravar("dc_habilidade_adicionar", { cargo_nome: cargoNome, habilidade_id: habilidadeId });
      setBusca("");
      setAberta(false);
    });
  const remover = (s: Selecionada) => comSessao(() => gravar("dc_habilidade_remover", { id: s.id }));
  const podeRemover = (s: Selecionada) => operacional && (ehRH || (s.status === "sugerido" && minhaColaboradorId != null && s.sugerido_por_colaborador_id === minhaColaboradorId));

  return (
    <div className={base.campo}>
      <div className={base.campoTopo}>
        <span className={base.campoLabel}>Habilidades técnicas</span>
      </div>

      {erro && <div className={styles.erro}>{erro}</div>}
      <div className={base.chips}>
        {!dados ? (
          <span className={base.vazio}>{erro ? "—" : "Carregando…"}</span>
        ) : dados.selecionadas.length === 0 ? (
          <span className={base.vazio}>Nenhuma habilidade técnica selecionada</span>
        ) : (
          dados.selecionadas.map((s) => (
            <span key={s.id} className={s.status === "sugerido" ? `${base.chip} ${styles.chipPendente}` : base.chip} title={s.nova && s.descricao ? s.descricao : undefined}>
              {s.nome}
              {s.status === "sugerido" && <span className={styles.pendenteTag}>{s.nova ? "Nova · " : ""}Aguardando validação do RH</span>}
              {podeRemover(s) && (
                <button type="button" className={base.chipRemover} onClick={() => void remover(s)} disabled={ocupado} title={`Remover ${s.nome}`} aria-label={`Remover ${s.nome}`}>
                  <X size={11} />
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {operacional && dados && (
        <div className={styles.seletor}>
          <input
            className={base.input}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setAberta(true);
            }}
            onFocus={() => setAberta(true)}
            onBlur={() => window.setTimeout(() => setAberta(false), 150)}
            placeholder="Selecionar habilidade técnica…"
            aria-label="Pesquisar habilidade técnica no catálogo"
            disabled={ocupado}
          />
          {aberta && (
            <ul className={styles.lista} role="listbox">
              {opcoes.length === 0 ? (
                <li className={styles.semResultado}>Nenhuma habilidade encontrada no catálogo.</li>
              ) : (
                opcoes.map((h) => (
                  <li key={h.id}>
                    <button type="button" className={styles.opcao} onMouseDown={(e) => e.preventDefault()} onClick={() => void adicionar(h.id)}>
                      <strong>{h.nome}</strong>
                      {h.categoria && <span className={styles.opcaoCategoria}>{h.categoria}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
          {!sugerindo && (
            <button type="button" className={styles.linkSugerir} onClick={() => setSugerindo(true)}>
              <Plus size={13} /> {ehRH ? "Cadastrar nova habilidade técnica" : "Sugerir nova habilidade técnica"}
            </button>
          )}
          {sugerindo && (
            <SugerirHabilidade
              ehRH={ehRH}
              nomeInicial={busca}
              dados={dados}
              ocupado={ocupado}
              onUsarExistente={(id) => {
                setSugerindo(false);
                void adicionar(id);
              }}
              onCancelar={() => setSugerindo(false)}
              onEnviar={async (form) => {
                const ok = await comSessao(() => gravar("dc_habilidade_sugerir", { cargo_nome: cargoNome, ...form }));
                if (ok !== undefined) {
                  setSugerindo(false);
                  setBusca("");
                }
              }}
            />
          )}
        </div>
      )}
      {podeEditar && !operacional && <span className={styles.dica}>A seleção das habilidades técnicas é feita pelo RH ou pelo Gestor do cargo.</span>}

      {(textoLegado || textoPendente) && (
        <div className={base.propostaPendente}>
          <span className={base.propostaTag}>Texto anterior (legado, somente leitura)</span>
          <div className={base.propostaValor}>{textoLegado || "—"}</div>
          {textoPendente && textoPendente !== textoLegado && (
            <>
              <span className={base.propostaTag} style={{ marginTop: 6 }}>
                Texto proposto pendente de aprovação
              </span>
              <div className={base.propostaValor}>{textoPendente}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SugerirHabilidade(props: {
  ehRH: boolean;
  nomeInicial: string;
  dados: Dados;
  ocupado: boolean;
  onUsarExistente: (id: number) => void;
  onCancelar: () => void;
  onEnviar: (f: { nome: string; descricao: string; justificativa: string }) => Promise<void>;
}) {
  const [nome, setNome] = useState(props.nomeInicial);
  const [descricao, setDescricao] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [confirmou, setConfirmou] = useState(false);
  // Antes de sugerir: possíveis correspondências no catálogo e sugestões já pendentes (evita "Compras" × "Processos de compras").
  const parecidas = useMemo(() => possiveisCorrespondencias(props.dados.catalogo, nome), [props.dados.catalogo, nome]);
  const pendentesParecidas = useMemo(
    () => possiveisCorrespondencias(props.dados.sugestoes_pendentes.map((p, i) => ({ id: i, nome: p.nome, categoria: p.cargo })), nome, 4),
    [props.dados.sugestoes_pendentes, nome],
  );
  const igual = props.dados.catalogo.find((h) => mesmoNome(h.nome, nome));
  const precisaConfirmar = parecidas.length > 0 || pendentesParecidas.length > 0;
  return (
    <div className={styles.sugestao}>
      <label className={styles.rotulo}>
        Nome da habilidade técnica *
        <input className={base.input} value={nome} onChange={(e) => { setNome(e.target.value); setConfirmou(false); }} maxLength={200} autoFocus />
      </label>
      {nome.trim().length >= 3 && precisaConfirmar && (
        <div className={styles.parecidas}>
          <strong>Verifique se alguma habilidade existente atende à necessidade:</strong>
          <ul>
            {parecidas.map((h) => (
              <li key={h.id}>
                <span>{h.nome}</span>
                <button type="button" className={styles.linkSugerir} onClick={() => props.onUsarExistente(h.id)} disabled={props.ocupado}>
                  Usar esta
                </button>
              </li>
            ))}
            {pendentesParecidas.map((p) => (
              <li key={`p-${p.id}`}>
                <span>
                  {p.nome} <em className={styles.opcaoCategoria}>já sugerida em {p.categoria} — aguardando o RH</em>
                </span>
              </li>
            ))}
          </ul>
          {!igual && (
            <label className={styles.confirmar}>
              <input type="checkbox" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} /> Nenhuma delas atende — {props.ehRH ? "cadastrar" : "sugerir"} nova
            </label>
          )}
        </div>
      )}
      {igual && <div className={styles.erro}>Já existe no catálogo: “{igual.nome}” — use “Usar esta”.</div>}
      <label className={styles.rotulo}>
        Descrição
        <textarea className={base.input} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />
      </label>
      {!props.ehRH && (
        <label className={styles.rotulo}>
          Justificativa / observação
          <textarea className={base.input} rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={2000} />
        </label>
      )}
      <span className={styles.dica}>
        {props.ehRH ? "Entra no Catálogo de Habilidades Técnicas e fica disponível para todos os cargos." : "A sugestão fica aguardando validação do RH; só depois entra no Catálogo."}
      </span>
      <div className={styles.acoes}>
        <button type="button" className={styles.botaoSecundario} onClick={props.onCancelar} disabled={props.ocupado}>
          Cancelar
        </button>
        <button
          type="button"
          className={styles.botaoPrimario}
          disabled={props.ocupado || nome.trim().length < 3 || Boolean(igual) || (precisaConfirmar && !confirmou)}
          onClick={() => void props.onEnviar({ nome: nome.trim(), descricao: descricao.trim(), justificativa: justificativa.trim() })}
        >
          {props.ocupado ? "Enviando…" : props.ehRH ? "Cadastrar e selecionar" : "Enviar sugestão"}
        </button>
      </div>
    </div>
  );
}
