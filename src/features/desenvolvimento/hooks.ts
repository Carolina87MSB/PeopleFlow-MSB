import { useEffect, useState } from "react";
import type { Pagina } from "./devRepository";

/** Carrega uma consulta assíncrona, refazendo quando `deps` mudam. Sem cache
 * global: cada tela busca só o que exibe, quando é aberta. */
export function useConsulta<T>(fn: () => Promise<T>, deps: unknown[]): { dados: T | null; erro: string | null; carregando: boolean } {
  const [estado, setEstado] = useState<{ dados: T | null; erro: string | null; carregando: boolean }>({ dados: null, erro: null, carregando: true });
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
  }, deps);
  return estado;
}

export function usePaginado<T>(fn: (pagina: number) => Promise<Pagina<T>>, deps: unknown[]) {
  // Qualquer mudança de filtro (deps) volta para a 1ª página, sem buscar a página antiga antes.
  const chave = JSON.stringify(deps);
  const [estado, setEstado] = useState({ chave, pagina: 0 });
  const pagina = estado.chave === chave ? estado.pagina : 0;
  const consulta = useConsulta(() => fn(pagina), [pagina, chave]);
  return { ...consulta, pagina, setPagina: (p: number) => setEstado({ chave, pagina: p }) };
}
