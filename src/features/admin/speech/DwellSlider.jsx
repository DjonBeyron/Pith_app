import { DWELL_MIN, DWELL_MAX, DWELL_STEP } from '../../../shared/lib/speech/flashDwell.js'

// Ползунок порога «мелькания» ошибочной формы (правило «первое увиденное»): 0–1200 мс, шаг 50; 0 = любое появление ошибочной формы в потоке interim.
// Общий для раздела «Эксперименты» и «Теста 1»; значение хранит useAntiPredict (settings.dwell).
export default function DwellSlider({ value, onChange, disabled }) {
  return (
    <label className="aspLabel">Порог мелькания ошибочной формы: {value} мс ({DWELL_MIN}–{DWELL_MAX}; 0 = любое появление в потоке)
      <input type="range" min={DWELL_MIN} max={DWELL_MAX} step={DWELL_STEP} value={value} disabled={disabled} aria-label="Порог мелькания, мс" data-testid="dwell-slider"
        onChange={e => onChange(Number(e.target.value))} />
    </label>
  )
}
