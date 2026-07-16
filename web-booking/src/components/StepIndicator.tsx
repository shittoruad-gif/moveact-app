interface Step { key: string; label: string; }

interface Props {
  steps: Step[];
  current: number;   // 0-based index of the active step
}

// Hot Pepper風の進行インジケータ（円ノード＋連結バー）
export function StepIndicator({ steps, current }: Props) {
  return (
    <div className="step-ind">
      {steps.map((s, i) => (
        <div key={s.key} className={`si ${i === current ? 'active' : ''} ${i < current ? 'done' : ''}`}>
          <div className="si-node">{i < current ? '✓' : i + 1}</div>
          <div className="si-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
