import { pLog } from '../../../../shared/lib/debug.js'
import { glowOn, glowOff, glowAssembled } from './dictatorGlowDebug.js'
import { mapWordLayersToChips, answerOrderOf, wordGreenAt, extrasStartSec, resultHoldSec } from '../../../../shared/lib/tableDictatorTiming.js'

// Клип слова/ячейки может стоять ПОСЛЕ конца аудио (10с-хвост таймлайна) — целиком
// (слово, которого физически нет в записи) или НАПОЛОВИНУ (начался во время игры,
// но его конец, т.е. длительность свечения, приходится уже на хвост). RAF уже
// остановлен (ended) и сам такие клипы не гасит — ON и OFF планируем раздельно
// таймерами от момента окончания аудио, иначе конец свечения (длина слоя) теряется.
function scheduleLayer(layer, {
  cells, chipKey, tEnd, timers, addedCellsRef, assembledRef, extrasStart, inBoxDelayMs = 300,
  setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys, setRevealedIds,
}) {
  const clip = layer.clips?.[0]
  // Собственный 👁 клипа подсветки (только у cell-слоя) выключен — подсветка+выбор
  // не планируем вообще, но проявление текста (ниже) от этого не зависит.
  if (clip && layer.highlightOn !== false) {
    // Для слова зелёный стартует не в начале клипа, а после лид-ина (анимация+буфер) —
    // клип начинается с анимации, реальный «выбор» (зелёный) сдвинут на лид-ин. У
    // последнего по времени word-слоя лид-ин длиннее — ждёт ещё и отъезд таблицы.
    const greenAt   = layer.word ? wordGreenAt(clip, extrasStart) : clip.start
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
          const key = chipKey ?? null
          if (!key) return
          setActiveExtraKeys(prev => new Set([...prev, key]))
          pLog(`[td-post] СЛОВО-ON "${layer.word}" после конца аудио → в бокс через ${inBoxDelayMs}мс`)
          glowOn(key, `СЛОВО "${layer.word}"`, cfgDur)
          const id = setTimeout(() => {
            setExtrasAssembled(prev => [...prev, { value: layer.word, key }])
            glowAssembled(key, `СЛОВО "${layer.word}"`)
          }, inBoxDelayMs)
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
          const key = chipKey ?? null
          if (!key) return
          glowOff(key, `СЛОВО "${layer.word}"`)
          setActiveExtraKeys(prev => { const s = new Set(prev); s.delete(key); return s })
        }
      }, offDelay * 1000))
    }
  }

  // Проявление текста ячейки (clips[1], независимо от подсветки) — если появление
  // и/или исчезновение приходятся на хвост после конца аудио, RAF их уже не отследит.
  const reveal = layer.cellId ? layer.clips?.[1] : null
  if (reveal) {
    const revealOnDelay  = reveal.start - tEnd
    const revealOffDelay = reveal.end   - tEnd
    if (revealOnDelay >= -0.02) {
      timers.current.push(setTimeout(() => {
        setRevealedIds(prev => new Set(prev).add(layer.cellId))
      }, Math.max(0, revealOnDelay) * 1000))
    }
    if (revealOffDelay > 0.02) {
      timers.current.push(setTimeout(() => {
        setRevealedIds(prev => { const s = new Set(prev); s.delete(layer.cellId); return s })
      }, revealOffDelay * 1000))
    }
  }
}

// Докуда тянется досборка: последнее слово/ячейка попадает в бокс через лид-ин
// (анимация + буфер) плюс те же 0.3с, что и во время игры. Проверять фразу
// раньше нельзя — она будет неполной, и верный ответ засчитается как ошибка.
// Именно так и ломалось: клип слова (1с) короче лид-ина последнего слова
// (1.32с), слово «зеленело» уже за концом клипа, а проверка стояла раньше.
const IN_BOX_S = 0.3

function pendingAssembleEnd(layers, extrasStart, addedCellsRef) {
  let latest = 0
  for (const l of layers ?? []) {
    if (l.visible === false || l.isCheck || l.highlightOn === false) continue
    const clip = l.clips?.[0]
    if (!clip) continue
    if (l.cellId && addedCellsRef.current.has(`cell-${l.cellId}`)) continue
    const inBox = (l.word ? wordGreenAt(clip, extrasStart) : clip.start) + IN_BOX_S
    if (inBox > latest) latest = inBox
  }
  return latest
}

// Вызывается из handleEnded, когда у таймлайна есть слой «Проверить» (checkAt != null).
// 1) дособирает слова/ячейки, чьи клипы стоят после конца аудио;
// 2) планирует запуск проверки (in) на checkAt;
// 3) планирует обратную анимацию закрытия (out) на checkOut.
export function schedulePostAudioCheck({
  timeline, cells, shuffledExtras, extraFromAnswer, checkAt, checkOut, audioRef, timers,
  rfxChipsRef, rfxCheckRef, rfxCloseRef, addedCellsRef, assembledRef,
  setPhase, setChipsVisible, setAssembled, setExtrasAssembled,
  setHighlighted, setUsedCells, setActiveExtraKeys, setRevealedIds, checkRef, closeRef,
}) {
  if (!rfxChipsRef.current) { rfxChipsRef.current = true; setPhase('extras'); setChipsVisible(true) }
  const tEnd = Number.isFinite(audioRef.current?.duration) ? audioRef.current.duration : checkAt
  const extrasStart = extrasStartSec(timeline?.layers)
  const chipByLayer = mapWordLayersToChips(timeline?.layers, shuffledExtras)

  // Слова с одинаковым стартом падают в бокс в порядке ответа: планируем их в
  // этом же порядке и разносим на пару миллисекунд, чтобы очередь не решал
  // порядок слоёв на таймлайне
  const ordered = [...(timeline?.layers ?? [])].sort((a, b) => {
    if (!a.word || !b.word) return 0
    const sa = a.clips?.[0]?.start ?? 0, sb = b.clips?.[0]?.start ?? 0
    if (Math.abs(sa - sb) > 0.001) return sa - sb
    return answerOrderOf(a.word, extraFromAnswer) - answerOrderOf(b.word, extraFromAnswer)
  })

  let wordSeq = 0
  for (const layer of ordered) {
    if (layer.visible === false || layer.isCheck) continue
    if (!layer.cellId && !layer.word) continue
    scheduleLayer(layer, {
      cells, chipKey: chipByLayer.get(layer.id), tEnd, timers, addedCellsRef, assembledRef,
      extrasStart,
      inBoxDelayMs: layer.word ? 300 + (wordSeq++) : 300,
      setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys, setRevealedIds,
    })
  }

  // Проверка ждёт досборку: берём поздний из двух моментов — метку «Проверить»
  // и конец досборки с небольшим зазором
  const pendingEnd = pendingAssembleEnd(timeline?.layers, extrasStart, addedCellsRef)
  const checkTime  = Math.max(checkAt, pendingEnd + 0.05)
  const shift      = checkTime - checkAt

  if (!rfxCheckRef.current) {
    rfxCheckRef.current = true
    const d = Math.max(0, (checkTime - tEnd) * 1000)
    if (shift > 0.001) {
      pLog(`[td-auto] ended: проверка сдвинута на +${Math.round(shift * 1000)}мс — ждём досборку до ${pendingEnd.toFixed(2)}s`)
    }
    pLog(`[td-auto] ended: проверка через ${Math.round(d)}мс (checkAt=${checkAt} после аудио ${tEnd.toFixed(2)}s)`)
    timers.current.push(setTimeout(() => checkRef.current?.(), d))
  }
  const hold = resultHoldSec(checkAt, checkOut)
  if (hold != null && !rfxCloseRef.current) {
    rfxCloseRef.current = true
    // Результат держится ровно длину клипа «Проверить», считая от момента
    // самой проверки: сдвинулась проверка — сдвинулся и показ, длина та же
    const d = Math.max(0, (checkTime - tEnd + hold) * 1000)
    pLog(`[td-auto] ended: закрытие через ${Math.round(d)}мс (результат виден ${hold.toFixed(2)}s = длина клипа проверки)`)
    timers.current.push(setTimeout(() => closeRef.current?.(), d))
  }
}
