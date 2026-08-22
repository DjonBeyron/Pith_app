// Слова вне таблицы: список чипов под уехавшей таблицей. Зелёным горит то
// слово, чей клип идёт сейчас; упавшее в бокс тускнеет до 40%.
//
// Мерцание выбора длится ровно столько, сколько светится слой на таймлайне —
// как и у ячеек таблицы (переменная --td-flash, см. table-dictator.css).
export default function TableExtraChips({
  words, chipStyles, assembledKeys, activeKeys, hasExtraLayers, flashDurations,
}) {
  return (
    <div className="tdExtrasSection">
      {words.map((word, i) => {
        const key   = `extra-${i}`
        const inBox = assembledKeys.has(key)
        // В timeline-режиме (checkAt) зелёный держится до конца клипа, а не
        // гаснет при падении в бокс — как и подсветка ячеек в таблице.
        // В авто-режиме (без таймлайна) зелёной фазы нет вовсе — сразу done.
        const green = hasExtraLayers && activeKeys.has(key)
        const done  = inBox && !green
        const flash = flashDurations?.get(key)
        // Задержка нужна только анимации ПОЯВЛЕНИЯ списка (чипы выезжают по
        // очереди). Она же — inline animation-delay, и когда слово загорается,
        // та же задержка сдвигала бы мерцание: соседние слова мигали вразнобой,
        // хотя на таймлайне стоят на одном времени. У горящего чипа задержки нет.
        const style = {
          ...(green ? {} : chipStyles[i]),
          ...(flash ? { '--td-flash': `${flash}s` } : {}),
        }
        return (
          <button
            key={i}
            style={style}
            className={['tdExtraChip', green && 'tdExtraChipUsed', done && 'tdExtraChipDone']
              .filter(Boolean).join(' ')}
          >{word}</button>
        )
      })}
    </div>
  )
}
