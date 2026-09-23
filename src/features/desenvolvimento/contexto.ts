import { createContext, useContext } from "react";
import type { PerfilDesenvolvimento, PessoaDesenvolvimento } from "./devRepository";

export interface ContextoDesenvolvimento {
  perfil: PerfilDesenvolvimento;
  colaboradorId: number;
  pessoas: PessoaDesenvolvimento[];
  pessoaPorId: Map<number, PessoaDesenvolvimento>;
}

export const ContextoDesenvolvimentoCtx = createContext<ContextoDesenvolvimento | null>(null);

export function useDesenvolvimento(): ContextoDesenvolvimento {
  const ctx = useContext(ContextoDesenvolvimentoCtx);
  if (!ctx) throw new Error("useDesenvolvimento fora do módulo Desenvolvimento");
  return ctx;
}

