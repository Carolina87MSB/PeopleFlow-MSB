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
