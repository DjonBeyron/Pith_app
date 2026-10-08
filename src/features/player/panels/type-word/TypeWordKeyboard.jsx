import { Delete } from 'lucide-react'

// Клавиатура «Напечатай слово» — минималистичная, как на iPhone: ряды букв, стирание
// справа внизу. Светятся (нажимаются) только буквы слова и добавленные автором,
// остальные тусклые и неактивные — тускнеет сама буква (.twKeyLabel), фон клавиши у всех один. Знаки вне раскладки
// (апостроф, é…) стоят в последнем ряду слева от «z»; нижний ряд — только пробел, если слову он нужен
// (см. keyboardModel в shared/lib/typeWordKeys.js).
// shift (лента «Ловля слов»): null — как в плеере (подписи всегда ЗАГЛАВНЫЕ, CSS text-transform); true/false — подписи
// следуют за регистром: true — заглавные (следующая буква будет заглавной, как шифт на iPhone), false — строчные.
// helped (лента, «Помочь памяти»): запутыватели (k.lure) трясутся, тускнеют и становятся мёртвыми (стили — .twHelped).
function Key({ k, disabled, helped, onKey }) {
  return (
    <button
      type="button"
      className={`twKey${k.lit ? '' : ' twKeyDim'}${k.lure ? ' twKeyLure' : ''}${k.ch === ' ' ? ' twKeySpace' : ''}`}
      disabled={disabled || !k.lit || (helped && !!k.lure)}
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

export default function TypeWordKeyboard({ model, disabled, helped = false, shift = null, onKey, onBackspace }) {
  const bottom = model.space ? [{ ch: ' ', lit: true }] : []
  const caseCls = shift === null ? '' : shift ? ' twShift' : ' twLower'
  return (
    <div className={`twKeyboard${helped ? ' twHelped' : ''}${caseCls}`} role="group" aria-label="Клавиатура" style={{ '--tw-cols': model.cols }}>
      {model.rows.map((row, ri) => {
        const last = ri === model.rows.length - 1
        // Последний ряд со знаками слева от «z» сдвинут левее, чтобы поместиться рядом со «Стереть» (.twRowLong)
        const long = last && model.lastExtra > 0
        return (
          <div key={ri} className={`twRow twRow${ri}${long ? ' twRowLong' : ''}`} style={long ? { '--tw-n': row.length } : undefined}>
            {row.map(k => <Key key={k.ch} k={k} disabled={disabled} helped={helped} onKey={onKey} />)}
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
          {bottom.map(k => <Key key={k.ch} k={k} disabled={disabled} helped={helped} onKey={onKey} />)}
        </div>
      )}
    </div>
  )
}
