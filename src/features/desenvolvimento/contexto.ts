import { createContext, useContext } from "react";
import type { PerfilDesenvolvimento, PessoaDesenvolvimento } from "./devRepository";

export interface ContextoDesenvolvimento {
  perfil: PerfilDesenvolvimento;
  colaboradorId: number;
  pessoas: PessoaDesenvolvimento[];
  pessoaPorId: Map<number, PessoaDesenvolvimento>;
  /** Pode registrar treinamento: RH ou colaborador (inclusive Gestor) com a habilitação concedida pelo RH. */
  podeRegistrar: boolean;
  /** Habilitação permanente concedida pelo RH (o RH não depende dela). Só o habilitado administra treinamentos; o Gestor sem habilitação acompanha. */
  habilitado: boolean;
}

export const ContextoDesenvolvimentoCtx = createContext<ContextoDesenvolvimento | null>(null);

export function useDesenvolvimento(): ContextoDesenvolvimento {
  const ctx = useContext(ContextoDesenvolvimentoCtx);
  if (!ctx) throw new Error("useDesenvolvimento fora do módulo Desenvolvimento");
  return ctx;
}

