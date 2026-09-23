import { useCallback, useEffect, useState } from "react";
import type { Pagina } from "./devRepository";

interface EstadoConsulta<T> {
  dados: T | null;
  erro: string | null;
  carregando: boolean;
}

/** Carrega uma consulta assíncrona, refazendo quando `deps` mudam. Sem cache
 * global: cada tela busca só o que exibe, quando é aberta. `mutar` aplica uma
 * alteração local (ex.: item recém-salvo) sem nova ida ao banco. */
export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [estado, setEstado] = useState<EstadoConsulta<T>>({ dados: null, erro: null, carregando: true });
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: null }));
    fn()
      .then((dados) => vivo && setEstado({ dados, erro: null, carregando: false }))
      .catch((e: unknown) => vivo && setEstado({ dados: null, erro: e instanceof Error ? e.message : String(e), carregando: false }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  const mutar = useCallback((f: (dados: T) => T) => setEstado((s) => (s.dados ? { ...s, dados: f(s.dados) } : s)), []);
  return { ...estado, recarregar, mutar };
}

export function usePaginado<T>(fn: (pagina: number) => Promise<Pagina<T>>, deps: unknown[]) {
  // Qualquer mudança de filtro (deps) volta para a 1ª página, sem buscar a página antiga antes.
  const chave = JSON.stringify(deps);
  const [estado, setEstado] = useState({ chave, pagina: 0 });
  const pagina = estado.chave === chave ? estado.pagina : 0;
  const consulta = useConsulta(() => fn(pagina), [pagina, chave]);
  const { mutar } = consulta;
  /** Substitui um item da página atual (atualização localizada após gravação). */
  const atualizarItem = useCallback(
    (igual: (item: T) => boolean, novo: T) => mutar((d) => ({ ...d, itens: d.itens.map((i) => (igual(i) ? novo : i)) })),
    [mutar],
  );
  return { ...consulta, pagina, setPagina: (p: number) => setEstado({ chave, pagina: p }), atualizarItem };
}
