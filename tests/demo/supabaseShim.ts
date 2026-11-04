// Substitui src/lib/supabaseClient.ts SOMENTE na demonstração local: as consultas vão para o servidor local (banco em memória, pessoas
// fictícias) com o papel e o RLS da pessoa escolhida. Nada sai para o Supabase de produção.
const pessoa = () => localStorage.getItem("demo-persona") ?? "rh";

type Filtro = { t: string; c: string; v?: unknown };
class Consulta implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null; count: number | null }> {
  private cols = "*";
  private count = false;
  private head = false;
  private filtros: Filtro[] = [];
  private ordem: { c: string; asc: boolean; nullsFirst: boolean }[] = [];
  private limite: number | null = null;
  private faixa: [number, number] | null = null;
  private modo: "lista" | "single" | "maybe" = "lista";
  constructor(private tabela: string) {}
  select(cols = "*", opts: { count?: string; head?: boolean } = {}) { this.cols = cols; this.count = Boolean(opts.count); this.head = Boolean(opts.head); return this; }
  eq(c: string, v: unknown) { this.filtros.push({ t: "eq", c, v }); return this; }
  neq(c: string, v: unknown) { this.filtros.push({ t: "neq", c, v }); return this; }
  in(c: string, v: unknown[]) { this.filtros.push({ t: "in", c, v }); return this; }
  is(c: string, _v: null) { this.filtros.push({ t: "is", c }); return this; }
  not(c: string, _op: string, _v: null) { this.filtros.push({ t: "not", c }); return this; }
  ilike(c: string, v: string) { this.filtros.push({ t: "ilike", c, v }); return this; }
  or(expr: string) { this.filtros.push({ t: "or", c: "x", v: expr }); return this; }
  order(c: string, o: { ascending?: boolean; nullsFirst?: boolean } = {}) { this.ordem.push({ c, asc: o.ascending !== false, nullsFirst: o.nullsFirst === true }); return this; }
  limit(n: number) { this.limite = n; return this; }
  range(a: number, b: number) { this.faixa = [a, b]; return this; }
  single() { this.modo = "single"; return this; }
  maybeSingle() { this.modo = "maybe"; return this; }
  then<R1, R2>(ok?: (v: { data: unknown; error: { code?: string; message: string } | null; count: number | null }) => R1 | PromiseLike<R1>, err?: (e: unknown) => R2 | PromiseLike<R2>) {
    return fetch("/demo/q", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: pessoa(), tabela: this.tabela, cols: this.cols, count: this.count, head: this.head, filtros: this.filtros, ordem: this.ordem, limite: this.limite, faixa: this.faixa, modo: this.modo }),
    })
      .then((r) => r.json())
      .then(ok, err);
  }
}

export const supabaseConfigured = true;
export const supabase = {
  from: (tabela: string) => new Consulta(tabela),
  auth: {
    getSession: async () => ({ data: { session: { access_token: pessoa() } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  storage: {
    from: (_bucket: string) => ({
      uploadToSignedUrl: async (path: string, _token: string, arquivo: File, opts?: { contentType?: string }) => {
        await fetch("/demo/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, size: arquivo.size, mime: opts?.contentType ?? arquivo.type }) });
        return { data: { path }, error: null };
      },
    }),
  },
};
