// Cliente da IA (Fase 8C): SOMENTE no servidor. A chave nunca vai ao navegador (variável SEM prefixo VITE_).
//
// Variáveis de ambiente (Vercel):
//   ANTHROPIC_API_KEY   chave do provedor (obrigatória para a IA funcionar)
//   PDI_IA_MODELO       id do modelo (obrigatória: o modelo NÃO é fixo no código; a escolha final sai de uma comparação controlada)
//   PDI_IA_HABILITADA   "true" liga a IA; qualquer outro valor (ou ausente) desliga — chave geral de segurança
//   PDI_IA_ESFORCO      opcional (low | medium | high | xhigh | max): profundidade do raciocínio, só se o modelo suportar
//
// Sem chave, sem modelo ou desabilitada: `obterClienteIa()` devolve null, a tela mostra "indisponível" e o fluxo manual da
// Fase 7 continua. A IA é assistência, nunca dependência.

export type MotivoIndisponivel = "desabilitada" | "sem_chave" | "sem_modelo";

export interface EstadoIa {
  disponivel: boolean;
  motivo?: MotivoIndisponivel;
}

export interface ConfigIa {
  habilitada: boolean;
  chave: string | null;
  modelo: string | null;
  esforco: string | null;
}

export interface RespostaIa {
  /** JSON já interpretado (ainda NÃO validado: quem valida é pdiIaNucleo.validarSaida) */
  bruto: unknown;
  /** modelo que efetivamente respondeu */
  modelo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
}

export interface PedidoIa {
  sistema: string;
  usuario: string;
  schema: object;
}

export interface ClienteIa {
  provedor: "anthropic";
  /** modelo configurado (é o que fica gravado na interpretação) */
  modelo: string;
  analisar(pedido: PedidoIa): Promise<RespostaIa>;
}

export type CodigoErroIa = "indisponivel" | "timeout" | "limite" | "recusada" | "truncada" | "sem_texto" | "json_invalido" | "autenticacao" | "http";

export class ErroIa extends Error {
  codigo: CodigoErroIa;
  retentavel: boolean;
  constructor(codigo: CodigoErroIa, mensagem: string, retentavel: boolean) {
    super(mensagem);
    this.codigo = codigo;
    this.retentavel = retentavel;
  }
}

const ESFORCOS = ["low", "medium", "high", "xhigh", "max"];
const limpo = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function lerConfigIa(env: Record<string, string | undefined> = process.env): ConfigIa {
  const esforco = limpo(env.PDI_IA_ESFORCO);
  return {
    habilitada: (env.PDI_IA_HABILITADA ?? "").trim().toLowerCase() === "true",
    chave: limpo(env.ANTHROPIC_API_KEY),
    modelo: limpo(env.PDI_IA_MODELO),
    esforco: esforco && ESFORCOS.includes(esforco) ? esforco : null,
  };
}

// Para testes: undefined = usa o ambiente; null = força "indisponível"; objeto = cliente falso.
let substituto: ClienteIa | null | undefined;
export function definirClienteIaParaTestes(c: ClienteIa | null | undefined) {
  substituto = c;
}

export function estadoIa(env: Record<string, string | undefined> = process.env): EstadoIa {
  if (substituto !== undefined) return substituto ? { disponivel: true } : { disponivel: false, motivo: "desabilitada" };
  const c = lerConfigIa(env);
  if (!c.habilitada) return { disponivel: false, motivo: "desabilitada" };
  if (!c.chave) return { disponivel: false, motivo: "sem_chave" };
  if (!c.modelo) return { disponivel: false, motivo: "sem_modelo" };
  return { disponivel: true };
}

export function obterClienteIa(env: Record<string, string | undefined> = process.env): ClienteIa | null {
  if (substituto !== undefined) return substituto;
  const c = lerConfigIa(env);
  if (!c.habilitada || !c.chave || !c.modelo) return null;
  return criarClienteAnthropic({ chave: c.chave, modelo: c.modelo, esforco: c.esforco });
}

export const MENSAGEM_INDISPONIVEL: Record<MotivoIndisponivel, string> = {
  desabilitada: "A análise com IA está desligada. O fluxo manual continua funcionando.",
  sem_chave: "A análise com IA ainda não foi configurada (chave do provedor ausente). O fluxo manual continua funcionando.",
  sem_modelo: "A análise com IA ainda não foi configurada (modelo ausente). O fluxo manual continua funcionando.",
};

interface OpcoesCliente {
  /** injeção para teste técnico sem rede */
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}

/** Cliente real (SDK oficial). A importação do SDK é sob demanda: quem não usa IA não paga o custo de carregá-lo. */
export function criarClienteAnthropic(cfg: { chave: string; modelo: string; esforco: string | null }, opcoes: OpcoesCliente = {}): ClienteIa {
  let sdk: Promise<typeof import("@anthropic-ai/sdk")> | null = null;
  return {
    provedor: "anthropic",
    modelo: cfg.modelo,
    async analisar(pedido: PedidoIa): Promise<RespostaIa> {
      sdk ??= import("@anthropic-ai/sdk");
      const mod = await sdk;
      const Anthropic = mod.default;
      const client = new Anthropic({ apiKey: cfg.chave, timeout: opcoes.timeoutMs ?? 60_000, maxRetries: opcoes.maxRetries ?? 1, ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}) });
      let resp;
      try {
        // sem prefill, sem parâmetros de amostragem, sem tool_choice forçado: o formato vem de output_config.format
        resp = await client.messages.create({
          model: cfg.modelo,
          max_tokens: 4000,
          system: pedido.sistema,
          messages: [{ role: "user", content: pedido.usuario }],
          output_config: { format: { type: "json_schema", schema: pedido.schema as Record<string, unknown> }, ...(cfg.esforco ? { effort: cfg.esforco as "low" } : {}) },
        });
      } catch (e) {
        throw traduzirErro(e, mod.default);
      }
      if (resp.stop_reason === "refusal") throw new ErroIa("recusada", "O provedor recusou analisar este conteúdo.", true);
      if (resp.stop_reason === "max_tokens") throw new ErroIa("truncada", "A resposta da IA foi cortada antes de terminar.", true);
      const bloco = resp.content.find((b) => b.type === "text");
      if (!bloco || bloco.type !== "text" || !bloco.text.trim()) throw new ErroIa("sem_texto", "A IA não devolveu texto.", true);
      let bruto: unknown;
      try {
        bruto = JSON.parse(bloco.text);
      } catch {
        throw new ErroIa("json_invalido", "A resposta da IA não é um JSON válido.", true);
      }
      return { bruto, modelo: resp.model, tokensEntrada: resp.usage?.input_tokens ?? null, tokensSaida: resp.usage?.output_tokens ?? null };
    },
  };
}

function traduzirErro(e: unknown, Anthropic: typeof import("@anthropic-ai/sdk").default): ErroIa {
  if (e instanceof ErroIa) return e;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ErroIa("timeout", "A IA demorou demais para responder.", true);
  if (e instanceof Anthropic.RateLimitError) return new ErroIa("limite", "O provedor está com limite de uso no momento.", true);
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new ErroIa("autenticacao", "O provedor recusou a chave configurada.", false);
  if (e instanceof Anthropic.APIConnectionError) return new ErroIa("indisponivel", "Não foi possível falar com o provedor da IA.", true);
  if (e instanceof Anthropic.APIError) return new ErroIa("http", `O provedor devolveu erro ${e.status ?? ""}.`.trim(), (e.status ?? 500) >= 500);
  return new ErroIa("indisponivel", "Falha inesperada ao chamar a IA.", true);
}
