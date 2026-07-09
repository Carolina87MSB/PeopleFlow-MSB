import styles from "./FilterChips.module.css";

interface FilterChipsProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export function FilterChips({ options, value, onChange }: FilterChipsProps) {
  return (
    <div className={styles.row}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={[styles.chip, opt === value ? styles.active : ""].join(" ")}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
