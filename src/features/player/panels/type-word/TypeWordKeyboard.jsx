import { Delete } from 'lucide-react'

// Клавиатура «Напечатай слово» — минималистичная, как на iPhone: ряды букв, стирание
// справа внизу. Светятся (нажимаются) только буквы слова и добавленные автором,
// остальные тусклые и неактивные — тускнеет сама буква (.twKeyLabel), фон клавиши у всех один. Ряд со знаками (апостроф, é…) и пробел — только
// если слову они нужны (см. keyboardModel в shared/lib/typeWordKeys.js).
function Key({ k, disabled, onKey }) {
  return (
    <button
      type="button"
      className={`twKey${k.lit ? '' : ' twKeyDim'}${k.ch === ' ' ? ' twKeySpace' : ''}`}
      disabled={disabled || !k.lit}
      aria-label={k.ch === ' ' ? 'пробел' : k.ch}
      data-key={k.ch}
      // Фокус не уводим с экрана: клавиши — просто тапы, системной клавиатуре тут не место
      onMouseDown={e => e.preventDefault()}
      onClick={() => onKey(k.ch)}
    >
      <span className="twKeyLabel">{k.ch === ' ' ? 'пробел' : k.ch}</span>
    </button>
  )
}

export default function TypeWordKeyboard({ model, disabled, onKey, onBackspace }) {
  const bottom = [...model.extraKeys, ...(model.space ? [{ ch: ' ', lit: true }] : [])]
  return (
    <div className="twKeyboard" role="group" aria-label="Клавиатура" style={{ '--tw-cols': model.cols }}>
      {model.rows.map((row, ri) => {
        const last = ri === model.rows.length - 1
        return (
          <div key={ri} className={`twRow twRow${ri}`}>
            {row.map(k => <Key key={k.ch} k={k} disabled={disabled} onKey={onKey} />)}
            {last && (
              <button
                type="button"
                className="twKey twKeyAction"
                disabled={disabled}
                aria-label="Стереть"
                onMouseDown={e => e.preventDefault()}
                onClick={onBackspace}
              >
                <span className="twKeyLabel"><Delete size={20} strokeWidth={1.8} /></span>
              </button>
            )}
          </div>
        )
      })}
      {bottom.length > 0 && (
        <div className="twRow twRowBottom">
          {bottom.map(k => <Key key={k.ch} k={k} disabled={disabled} onKey={onKey} />)}
        </div>
      )}
    </div>
  )
}
