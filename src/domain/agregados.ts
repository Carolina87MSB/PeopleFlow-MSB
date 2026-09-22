import type { CargoAgregado, CargoCustom, Colaborador, DepartamentoAgregado } from "../types/domain";

export function agregarDepartamentos(colaboradores: Colaborador[]): DepartamentoAgregado[] {
  const map = new Map<string, DepartamentoAgregado>();
  colaboradores.forEach((c) => {
    let d = map.get(c.depto);
    if (!d) {
      d = { nome: c.depto, code: c.deptoCode, count: 0, gestores: {}, cargos: new Set() };
      map.set(c.depto, d);
    }
    d.count++;
    d.cargos.add(c.cargo);
    d.gestores[c.gestor] = (d.gestores[c.gestor] || 0) + 1;
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export function contarPorGestor(colaboradores: Colaborador[]): Map<string, number> {
  const gestorCount = new Map<string, number>();
  colaboradores.forEach((c) => gestorCount.set(c.gestor, (gestorCount.get(c.gestor) || 0) + 1));
  return gestorCount;
}

export function agregarCargos(colaboradores: Colaborador[], cargosCustom: CargoCustom[] = []): CargoAgregado[] {
  const map = new Map<string, CargoAgregado>();
  colaboradores.forEach((c) => {
    let cg = map.get(c.cargo);
    if (!cg) {
      cg = { nome: c.cargo, nivel: c.nivel, count: 0, deptos: new Set() };
      map.set(c.cargo, cg);
    }
    cg.count++;
    cg.deptos.add(c.depto);
  });
  cargosCustom.forEach((c) => {
    if (map.has(c.nome)) return;
    map.set(c.nome, {
      nome: c.nome,
      nivel: c.nivel,
      count: 0,
      deptos: new Set([c.depto]),
      novo: true,
      vagas: c.vagas,
      descricao: c.descricao,
      faixa: c.faixa,
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/** Estende agregarCargos() com cargos que já têm Descrição de Cargo mas hoje
 * não têm nenhum ocupante ativo nem estão em cargosCustom — ex.: vaga aberta
 * por desligamento (RH, 2026-09: não deve mais sumir da tela de Cargos só
 * porque ninguém está alocado no momento; "0" em `count` já avisa que está
 * vago). Usado só em CargosPage.tsx — os outros usos de agregarCargos()
 * (Dashboard, Sidebar, Matriz de Habilidades) continuam com a semântica
 * original de "cargos em uso agora". Nível/departamento de um cargo vago
 * vêm do último colaborador conhecido (ativo ou não) — o cargo em si não
 * guarda essa informação sem ninguém ocupando-o. */
export function agregarTodosOsCargos(
  colaboradoresAtivos: Colaborador[],
  colaboradoresTodos: Colaborador[],
  cargosCustom: CargoCustom[],
  cargosComDescricao: string[],
): CargoAgregado[] {
  const base = agregarCargos(colaboradoresAtivos, cargosCustom);
  const map = new Map(base.map((c) => [c.nome, c]));
  cargosComDescricao.forEach((nome) => {
    if (map.has(nome)) return;
    const referencia = colaboradoresTodos.find((c) => c.cargo === nome);
    map.set(nome, {
      nome,
      nivel: referencia?.nivel ?? "Operacional",
      count: 0,
      deptos: new Set(referencia ? [referencia.depto] : []),
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}
