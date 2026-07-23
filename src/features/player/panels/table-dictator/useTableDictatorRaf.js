import { useEffect } from 'react'
import { WAVEFORM_FPS } from '../../../../shared/lib/audioUtils.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { logHudState } from './dictatorDebug.js'
import { glowOn, glowOff, glowAssembled } from './dictatorGlowDebug.js'
import { EXTRA_LEAD_IN_S, EXTRA_LEAD_IN_LAST_S, findLastWordLayerId, computeRevealedCellIds, sameIdSet } from '../../../../shared/lib/tableDictatorTiming.js'

const HUD_OFFSETS    = [-1, 0, 1]
const HUD_ALPHA_UP   = [0.60, 0.75, 0.50]
const HUD_ALPHA_DOWN = [0.15, 0.28, 0.18]

export function useTableDictatorRaf({
  playing, timeline, waveformData, cells, checkAt, checkOut, hasExtraLayers,
  audioRef, rafRef, prevActiveRef, prevExtraRef, addedCellsRef, assembledRef,
  barElsRef, barSmoothRef, rfxPhaseRef, rfxChipsRef, rfxAssembRef, rfxCheckRef, rfxCloseRef, timers,
  extraFromAnswer, shuffledExtras, checkRef, closeRef,
  setAssembled, setExtrasAssembled, setHighlighted, setUsedCells, setActiveExtraKeys, setPhase, setChipsVisible,
  setRevealedIds,
}) {
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return }

    // Heartbeat: раз в ~0.5с пишем время аудио + активные ячейки/фазу (throttle, не спамим кадрами)
    let lastHb = -1
    let hudLogged = false
    let prevReveal = null   // последний посчитанный набор проявленных ячеек (не дёргать setState зря)
    const greenedKeys = new Set()   // какие word-чипы уже загорались зелёным (чтобы 1 раз)
    const cellVal = id => cells.find(c => c.id === id)?.value?.trim() ?? `id=${id}`

    // Старт самого раннего видимого word-клипа — от него отсчитываем слайд/чипы (перед словом)
    let firstExtraStart = null
    for (const l of timeline?.layers ?? []) {
      if (l.visible === false || !l.word || !l.clips?.length) continue
      const s = l.clips[0].start
      if (firstExtraStart == null || s < firstExtraStart) firstExtraStart = s
    }
    // Последний по времени word-слой ждёт ещё и конец отъезда таблицы (см. tableDictatorTiming.js)
    const lastWordLayerId = findLastWordLayerId(timeline?.layers)

    const tick = () => {
      const t      = audioRef.current?.currentTime ?? 0
      const active = new Set()

      // Один раз в начале воспроизведения — диагностика мини-спектра (куда пропал)
      if (!hudLogged) {
        hudLogged = true
        logHudState(barElsRef.current[0]?.parentElement, { waveformData })
      }

      for (const layer of timeline?.layers ?? []) {
        if (!layer.cellId) continue
        if (layer.visible === false || layer.highlightOn === false) continue
        // clips[0] — подсветка (clips[1], если есть, — независимое проявление текста,
        // на неё здесь не смотрим, у неё своя логика в computeRevealedCellIds)
        const hlClip = layer.clips?.[0]
        if (!hlClip || t < hlClip.start || t >= hlClip.end) continue
        active.add(layer.cellId)
        const key = `cell-${layer.cellId}`
        if (!addedCellsRef.current.has(key)) {
          addedCellsRef.current.add(key)
          const val = cells.find(c => c.id === layer.cellId)?.value?.trim() ?? ''
          if (val) {
            // По требованию: слово падает в бокс через 0.3с ПОСЛЕ начала подсветки ячейки
            pLog(`[td-raf] ЯЧЕЙКА-ON "${val}" t=${t.toFixed(3)}s → в бокс через 0.3с`)
            glowOn(key, `ЯЧЕЙКА "${val}"`, hlClip.end - hlClip.start)
            const id = setTimeout(() => {
              assembledRef.current.push(val)
              setAssembled(prev => [...prev, val])
              pLog(`[td-raf] В-БОКС "${val}" (спустя 0.3с после подсветки, всего: ${assembledRef.current.length})`)
              glowAssembled(key, `ЯЧЕЙКА "${val}"`)
            }, 300)
            timers.current.push(id)
          }
        }
      }

      // Heartbeat времени аудио (для сверки: докуда доиграло + что горит)
      if (t - lastHb >= 0.5 || lastHb < 0) {
        lastHb = t
        const act = [...active].map(cellVal).join(',') || '—'
        pLog(`[td-hb] t=${t.toFixed(2)}s горят=[${act}] собрано=${assembledRef.current.length}`)
      }

      // Подсветка ячеек: включается на inpoint, выключается на outpoint
      let hlChanged = active.size !== prevActiveRef.current.size
      if (!hlChanged) {
        for (const id of active) {
          if (!prevActiveRef.current.has(id)) { hlChanged = true; break }
        }
      }
      if (hlChanged) {
        // Подсветка ON логируется выше (при планировании в бокс); тут только OFF
        const exited = []
        for (const id of prevActiveRef.current)
          if (!active.has(id)) {
            exited.push(id)
            pLog(`[td-raf] ЯЧЕЙКА-OFF "${cellVal(id)}" t=${t.toFixed(3)}s (outpoint — гаснет, ячейка → 40% opacity)`)
            glowOff(`cell-${id}`, `ЯЧЕЙКА "${cellVal(id)}"`)
          }
        prevActiveRef.current = new Set(active)
        setHighlighted(new Set(active))
        // Отыгравшие ячейки затемняем до 40% (по требованию: «выбранный текст → opacity 40%»)
        if (exited.length) setUsedCells(prev => new Set([...prev, ...exited]))
      }

      // Проявление текста ячеек (независимо от подсветки) — по clips[1] cell-слоя.
      // По умолчанию клип во всю длину таймлайна (текст виден всегда), но автор мог
      // подрезать его — тогда текст появляется/исчезает по opacity в нужный момент.
      const revealedNow = computeRevealedCellIds(timeline?.layers, t)
      if (!prevReveal || !sameIdSet(revealedNow, prevReveal)) {
        prevReveal = revealedNow
        setRevealedIds(revealedNow)
      }

      // ── Extras (слова вне таблицы) при наличии word-слоёв ──
      // Клип слова начинается с анимации (слайд таблицы + появление списка), и только
      // через EXTRA_LEAD_IN_S (анимация + буфер) слово реально загорается зелёным —
      // иначе список появляется и слово мгновенно зелёное, паузы не видно.
      if (hasExtraLayers && firstExtraStart != null) {
        if (t >= firstExtraStart && !rfxPhaseRef.current) {
          rfxPhaseRef.current = true; setPhase('extras')
          pLog(`[td-raf] phase:extras (слайд) t=${t.toFixed(2)} @ старт-клипа-слова=${firstExtraStart.toFixed(2)}s`)
        }
        if (t >= firstExtraStart + 0.2 && !rfxChipsRef.current) {
          rfxChipsRef.current = true; setChipsVisible(true)
          pLog(`[td-raf] chips появились t=${t.toFixed(2)}, зелёный не раньше t=${(firstExtraStart + EXTRA_LEAD_IN_S).toFixed(2)}`)
        }
        // Зелёный — после лид-ина (анимация+буфер) от старта клипа, а не сразу
        if (rfxChipsRef.current) {
          const ea = new Set()
          const eaDur = new Map()
          for (const l of timeline?.layers ?? []) {
            if (l.visible === false || !l.word || !l.clips?.length) continue
            const clip = l.clips[0]
            const greenFrom = clip.start + (l.id === lastWordLayerId ? EXTRA_LEAD_IN_LAST_S : EXTRA_LEAD_IN_S)
            if (t >= greenFrom && t < clip.end) {
              const idx = shuffledExtras.indexOf(l.word)
              if (idx === -1) continue
              const k = `extra-${idx}`
              ea.add(k)
              eaDur.set(k, clip.end - greenFrom)
            }
          }
          for (const k of ea) {
            if (greenedKeys.has(k)) continue
            greenedKeys.add(k)
            const word = shuffledExtras[+k.split('-')[1]]
            pLog(`[td-raf] СЛОВО-ON "${word}" ${k} t=${t.toFixed(3)}s → зелёный (совпал с таймлайном), в бокс через 0.3с`)
            glowOn(k, `СЛОВО "${word}"`, eaDur.get(k) ?? 0)
            const id = setTimeout(() => {
              rfxAssembRef.current = true
              setExtrasAssembled(prev => [...prev, { value: word, key: k }])
              pLog(`[td-raf] В-БОКС extra "${word}" (0.3с после зелёного)`)
              glowAssembled(k, `СЛОВО "${word}"`)
            }, 300)
            timers.current.push(id)
          }
          let ec = ea.size !== prevExtraRef.current.size
          if (!ec) for (const k of ea) if (!prevExtraRef.current.has(k)) { ec = true; break }
          if (ec) {
            for (const k of prevExtraRef.current) {
              if (!ea.has(k)) glowOff(k, `СЛОВО "${shuffledExtras[+k.split('-')[1]]}"`)
            }
            prevExtraRef.current = new Set(ea); setActiveExtraKeys(new Set(ea))
          }
        }
      }

      // ── Проверка + (для случая БЕЗ word-слоёв) checkAt-driven слайд/чипы/сборка ──
      if (checkAt != null) {
        if (!hasExtraLayers) {
          const animStart = Math.max(0, checkAt - 0.75)
          const chipStart = Math.max(0, checkAt - 0.45)
          if (t >= animStart && !rfxPhaseRef.current) {
            rfxPhaseRef.current = true; setPhase('extras'); pLog(`[td-raf] phase:extras t=${t.toFixed(2)}`)
          }
          if (t >= chipStart && !rfxChipsRef.current) {
            rfxChipsRef.current = true; setChipsVisible(true)
            const usedIdx    = new Set()
            const toAssemble = extraFromAnswer.map(word => {
              const idx = shuffledExtras.findIndex((w, i) => w === word && !usedIdx.has(i))
              if (idx === -1) { pLog(`[td-raf] WARN: "${word}" not in shuffledExtras`); return null }
              usedIdx.add(idx); return { value: word, key: `extra-${idx}` }
            }).filter(Boolean)
            pLog(`[td-raf] chips t=${t.toFixed(2)} assemble=[${toAssemble.map(e => e.value).join('|')}]`)
            const id = setTimeout(() => { rfxAssembRef.current = true; if (toAssemble.length) setExtrasAssembled(toAssemble) }, 300)
            timers.current.push(id)
          }
        }
        const noExtras = extraFromAnswer.length === 0
        // in-point: запускаем проверку (показ результата)
        if (t >= checkAt && (rfxAssembRef.current || noExtras) && !rfxCheckRef.current) {
          rfxCheckRef.current = true
          pLog(`[td-raf] CHECK (in) t=${t.toFixed(3)} checkAt=${checkAt} assembled=[${assembledRef.current.join('|')}]`)
          checkRef.current?.()
        }
        // out-point: обратная анимация (модуль уезжает вниз)
        if (checkOut != null && t >= checkOut && rfxCheckRef.current && !rfxCloseRef.current) {
          rfxCloseRef.current = true
          pLog(`[td-raf] CLOSE (out) t=${t.toFixed(3)} checkOut=${checkOut}`)
          closeRef.current?.()
        }
      }

      if (waveformData?.length) {
        const fi = Math.floor(t * WAVEFORM_FPS)
        barElsRef.current.forEach((bar, i) => {
          if (!bar) return
          const idx    = Math.max(0, Math.min(waveformData.length - 1, fi + HUD_OFFSETS[i]))
          const target = Math.pow(waveformData[idx] / 255, 0.55)
          const alpha  = target > barSmoothRef.current[i] ? HUD_ALPHA_UP[i] : HUD_ALPHA_DOWN[i]
          barSmoothRef.current[i] = barSmoothRef.current[i] * (1 - alpha) + target * alpha
          bar.style.transform = `scaleY(${Math.max(0.12, barSmoothRef.current[i] * 1.8)})`
        })
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    barSmoothRef.current = [0, 0, 0]
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, timeline, waveformData, cells, checkAt, checkOut, hasExtraLayers]) // eslint-disable-line
}
