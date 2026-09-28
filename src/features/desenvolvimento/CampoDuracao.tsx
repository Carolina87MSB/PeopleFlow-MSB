import styles from "./Desenvolvimento.module.css";

/** Duração em Horas + Minutos (gravada em minutos). Ex.: 0h15, 0h30, 1h30, 2h00. */
export function CampoDuracao({ rotulo, horas, minutos, onChange }: { rotulo: string; horas: string; minutos: string; onChange: (horas: string, minutos: string) => void }) {
  const soDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 4);
  return (
    <fieldset className={styles.campo} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend style={{ padding: 0 }}>{rotulo}</legend>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          aria-label={`${rotulo} — horas`}
          inputMode="numeric"
          value={horas}
          onChange={(e) => onChange(soDigitos(e.target.value), minutos)}
          placeholder="0"
          style={{ width: 64 }}
        />
        <span>h</span>
        <input
          aria-label={`${rotulo} — minutos (0 a 59)`}
          inputMode="numeric"
          value={minutos}
          onChange={(e) => onChange(horas, soDigitos(e.target.value).slice(0, 2))}
          placeholder="00"
          style={{ width: 64 }}
        />
        <span>min</span>
      </div>
    </fieldset>
  );
}
