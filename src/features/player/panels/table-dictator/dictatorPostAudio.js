import { pLog } from '../../../../shared/lib/debug.js'
import { glowOn, glowOff, glowAssembled } from './dictatorGlowDebug.js'
import { EXTRA_LEAD_IN_S, EXTRA_LEAD_IN_LAST_S, findLastWordLayerId } from '../../../../shared/lib/tableDictatorTiming.js'

// Клип слова/ячейки может стоять ПОСЛЕ конца аудио (10с-хвост таймлайна) — целиком
// (слово, которого физически нет в записи) или НАПОЛОВИНУ (начался во время игры,
// но его конец, т.е. длительность свечения, приходится уже на хвост). RAF уже
// остановлен (ended) и сам такие клипы не гасит — ON и OFF планируем раздельно
// таймерами от момента окончания аудио, иначе конец свечения (длина слоя) теряется.
function scheduleLayer(layer, {
  cells, shuffledExtras, tEnd, timers, addedCellsRef, assembledRef, isLastWord,
  setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys,
}) {
  const clip = layer.clips?.[0]
  if (!clip) return
  // Для слова зелёный стартует не в начале клипа, а после лид-ина (анимация+буфер) —
  // клип начинается с анимации, реальный «выбор» (зелёный) сдвинут на лид-ин. У
  // последнего по времени word-слоя лид-ин длиннее — ждёт ещё и отъезд таблицы.
  const leadIn    = isLastWord ? EXTRA_LEAD_IN_LAST_S : EXTRA_LEAD_IN_S
  const greenAt   = layer.word ? clip.start + leadIn : clip.start
  const onDelay   = greenAt   - tEnd
  const offDelay  = clip.end  - tEnd
  const cellKey   = layer.cellId ? `cell-${layer.cellId}` : null
  const alreadyOn = cellKey ? addedCellsRef.current.has(cellKey) : false

  const cfgDur = clip.end - greenAt

  // ON: только клипы, которые ещё не начались до конца аудио — начавшиеся уже отыграл RAF
  if (onDelay >= -0.02 && !alreadyOn) {
    timers.current.push(setTimeout(() => {
      if (layer.cellId) {
        addedCellsRef.current.add(cellKey)
        setHighlighted(prev => new Set([...prev, layer.cellId]))
        const val = cells.find(c => c.id === layer.cellId)?.value?.trim() ?? ''
        if (!val) return
        pLog(`[td-post] ЯЧЕЙКА-ON "${val}" после конца аудио → в бокс через 0.3с`)
        glowOn(cellKey, `ЯЧЕЙКА "${val}"`, cfgDur)
        const id = setTimeout(() => {
          assembledRef.current.push(val)
          setAssembled(prev => [...prev, val])
          glowAssembled(cellKey, `ЯЧЕЙКА "${val}"`)
        }, 300)
        timers.current.push(id)
      } else if (layer.word) {
        const idx = shuffledExtras.indexOf(layer.word)
        if (idx === -1) return
        const key = `extra-${idx}`
        setActiveExtraKeys(prev => new Set([...prev, key]))
        pLog(`[td-post] СЛОВО-ON "${layer.word}" после конца аудио → в бокс через 0.3с`)
        glowOn(key, `СЛОВО "${layer.word}"`, cfgDur)
        const id = setTimeout(() => {
          setExtrasAssembled(prev => [...prev, { value: layer.word, key }])
          glowAssembled(key, `СЛОВО "${layer.word}"`)
        }, 300)
        timers.current.push(id)
      }
    }, Math.max(0, onDelay) * 1000))
  }

  // OFF: конец клипа (длина свечения) приходится на хвост после аудио — не важно,
  // когда клип начался. Без этого «пограничные» слои остаются подсвеченными навсегда.
  if (offDelay > 0.02) {
    timers.current.push(setTimeout(() => {
      if (layer.cellId) {
        pLog(`[td-post] ЯЧЕЙКА-OFF id=${layer.cellId} после конца аудио (длина слоя истекла)`)
        glowOff(cellKey, `ЯЧЕЙКА id=${layer.cellId}`)
        setHighlighted(prev => { const s = new Set(prev); s.delete(layer.cellId); return s })
        setUsedCells(prev => new Set([...prev, layer.cellId]))
      } else if (layer.word) {
        const idx = shuffledExtras.indexOf(layer.word)
        if (idx === -1) return
        const key = `extra-${idx}`
        glowOff(key, `СЛОВО "${layer.word}"`)
        setActiveExtraKeys(prev => { const s = new Set(prev); s.delete(key); return s })
      }
    }, offDelay * 1000))
  }
}

// Вызывается из handleEnded, когда у таймлайна есть слой «Проверить» (checkAt != null).
// 1) дособирает слова/ячейки, чьи клипы стоят после конца аудио;
// 2) планирует запуск проверки (in) на checkAt;
// 3) планирует обратную анимацию закрытия (out) на checkOut.
export function schedulePostAudioCheck({
  timeline, cells, shuffledExtras, checkAt, checkOut, audioRef, timers,
  rfxChipsRef, rfxCheckRef, rfxCloseRef, addedCellsRef, assembledRef,
  setPhase, setChipsVisible, setAssembled, setExtrasAssembled,
  setHighlighted, setUsedCells, setActiveExtraKeys, checkRef, closeRef,
}) {
  if (!rfxChipsRef.current) { rfxChipsRef.current = true; setPhase('extras'); setChipsVisible(true) }
  const tEnd = Number.isFinite(audioRef.current?.duration) ? audioRef.current.duration : checkAt
  const lastWordLayerId = findLastWordLayerId(timeline?.layers)

  for (const layer of timeline?.layers ?? []) {
    if (layer.visible === false || layer.isCheck) continue
    if (!layer.cellId && !layer.word) continue
    scheduleLayer(layer, {
      cells, shuffledExtras, tEnd, timers, addedCellsRef, assembledRef,
      isLastWord: layer.id === lastWordLayerId,
      setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys,
    })
  }

  if (!rfxCheckRef.current) {
    rfxCheckRef.current = true
    const d = Math.max(0, (checkAt - tEnd) * 1000)
    pLog(`[td-auto] ended: проверка через ${Math.round(d)}мс (checkAt=${checkAt} после аудио ${tEnd.toFixed(2)}s)`)
    timers.current.push(setTimeout(() => checkRef.current?.(), d))
  }
  if (checkOut != null && !rfxCloseRef.current) {
    rfxCloseRef.current = true
    const d = Math.max(0, (checkOut - tEnd) * 1000)
    pLog(`[td-auto] ended: закрытие через ${Math.round(d)}мс (checkOut=${checkOut})`)
    timers.current.push(setTimeout(() => closeRef.current?.(), d))
  }
}
