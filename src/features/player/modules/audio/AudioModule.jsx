import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import { WAVE_H_BASE, BAR_W, BAR_GAP, ACCENT, loudestFrameIndex } from './audioWaveParts.js'
import { PlayTriangle, PauseIcon } from './AudioPlayIcons.jsx'
import PlayerTypingText from '../../PlayerTypingText.jsx'
import { analyzeWaveform, fmtAudioTime, probeAudioDuration, WAVEFORM_FPS } from '../../../../shared/lib/audioUtils.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { isWeakDevice } from '../../../../shared/lib/deviceTier.js'
import { buildCharTimings } from '../../../../shared/lib/charTimings.js'
import { usePlayedOffset, playedOffsetMs } from '../../usePlayedOffset.js'
import { useMissingMediaFallback, FALLBACK_MS } from '../../useMissingMediaFallback.js'
import { useAudioSource } from './useAudioSource.js'

export default function AudioModule({ node, file, onDone, adminPreview = false, pending = false }) {
  const [weakDevice] = useState(() => isWeakDevice())
  const [isPlaying,       setIsPlaying]       = useState(false)
  // Сразу true, если у голосового есть расшифровка: пузырь должен прилететь
  // в чат уже растушёванным. Раньше растушёвка включалась по старту печати —
  // сообщение появлялось с резким низом и щёлкало в размытый через секунду.
  // Ленивая инициализация, потому что node.typeData разбирается ниже
  const [isFading,        setIsFading]        = useState(() => !!node.typeData?.audio?.text)
  const [waveData,        setWaveData]        = useState(null)
  const [duration,        setDuration]        = useState(null)
  const [barCount,        setBarCount]        = useState(WAVE_H_BASE.length)
  const [textStarted,     setTextStarted]     = useState(false)
  const [revealedCharIdx, setRevealedCharIdx] = useState(-1)
  // Расшифровку показали целиком хотя бы раз — дальше её НЕ перепечатываем.
  // Повторный запуск старого голосового схлопывал текст в ноль и набирал
  // заново, пузырь проходил через десяток высот (замер: 57 → 60.3 → 69.3 →
  // 85 → 90), и на каждую PlayerBubble двигал ВСЮ ленту. Это и есть «чат
  // дёргается, когда запускаешь сообщение из истории».
  const fullyRevealedRef = useRef(false)

  const audioRef        = useRef(null)
  const rafRef          = useRef(null)
  // Цикл кадров волны — чтобы возобновить его после паузы снаружи (см. ниже)
  const tickRef         = useRef(null)
  const timeRef         = useRef(null)
  const waveRowRef      = useRef(null)
  const barElsRef       = useRef([])
  const barSmoothRef    = useRef(new Array(WAVE_H_BASE.length).fill(0))
  const prevBarCountRef = useRef(WAVE_H_BASE.length)

  // Отрицательный офсет триггера played — запустить следующую ноду до конца звука
  usePlayedOffset(playedOffsetMs(node), () => audioRef.current, onDone)

  const text           = node.typeData?.audio?.text         ?? ''
  const highlights     = node.typeData?.audio?.highlights   ?? []
  const wordTimings    = node.typeData?.audio?.wordTimings  ?? null
  const storedWaveform = node.typeData?.audio?.waveformData ?? null
  const storedDuration = node.typeData?.audio?.duration     ?? null

  // Печать под звук: время каждого символа считает charTimings.js — по
  // позициям слов в САМОМ тексте, а не по реконструкции «слова через пробел»
  const charTimings = useMemo(() => buildCharTimings(text, wordTimings), [wordTimings, text])

  const waveH = useMemo(() =>
    Array.from({ length: barCount }, (_, i) =>
      WAVE_H_BASE[Math.floor(i / barCount * WAVE_H_BASE.length)]
    ), [barCount])

  // Откуда берётся звук и почему адрес фиксируется — useAudioSource.js
  const { src, locked: srcLocked, lock: lockSrc, unlock: unlockSrc } = useAudioSource(node, file)

  // Аудио ещё не загружено, а сценарий смотрит админ: показываем текст, будто
  // сообщение звучит, и по окончании заглушки отпускаем цепочку дальше
  const stubMode = adminPreview && !src
  // Текст начинает печататься не сразу, а когда пузырь доехал до места
  useMissingMediaFallback(stubMode && !pending, onDone, {
    onStart: () => setTextStarted(true),
  })
  // Печать растягивается ровно на длительность заглушки: длинный текст не
  // обрывается на середине, короткий не «выстреливает» мгновенно — выглядит
  // так, будто его в этот момент озвучивают
  const stubSpeed = Math.max(12, Math.round(FALLBACK_MS / Math.max(1, text.length)))

  useEffect(() => {
    pLog('AudioModule mount/src change — r2Url=', file?.r2Url ?? 'null', 'src=', src ?? 'NULL')
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    // Сброс медиасостояния при смене src — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    setTextStarted(false)
    setRevealedCharIdx(-1)
    barSmoothRef.current.fill(0)
    setWaveData(storedWaveform?.length ? storedWaveform : null)
    setDuration(storedDuration || null)
    if (!src) { pLog('AudioModule: src is null, skipping load'); return }
    let cancelled = false
    if (!storedWaveform?.length) {
      analyzeWaveform(src).then(wd => { if (!cancelled) setWaveData(wd) }).catch(() => {})
    }
    if (!storedDuration) {
      probeAudioDuration(src).then(d => { if (!cancelled && d && isFinite(d)) setDuration(d) }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [src, storedWaveform, storedDuration])

  // Adaptive bar count — only update when width actually changes to avoid
  // ResizeObserver false-fires (layout changes from text mount / className) resetting state
  useEffect(() => {
    const el = waveRowRef.current
    if (!el) return
    const update = () => {
      const count = Math.max(20, Math.floor(el.offsetWidth / (BAR_W + BAR_GAP)))
      if (count === prevBarCountRef.current) return  // same width → skip reset entirely
      // Width genuinely changed: carry over smooth values proportionally
      const prev = prevBarCountRef.current
      barSmoothRef.current = Array.from({ length: count },
        (_, i) => barSmoothRef.current[Math.floor(i / count * prev)] || 0
      )
      prevBarCountRef.current = count
      barElsRef.current = []
      setBarCount(count)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function applyFirstFrame(wd) {
    if (!wd?.length) return
    const n = barElsRef.current.length
    const center = (n - 1) / 2
    // Раньше центр стоп-кадра был жёстко на индексе 0 (самое начало записи —
    // часто тишина/вдох перед речью), и кадр выглядел плоским. На слабых
    // устройствах tick() вообще не пересчитывает полоски во время игры
    // (см. ниже: fi=-1 всегда) — значит этот кадр виден не долю секунды до
    // старта, а ВСЮ игру целиком. Берём центром самую громкую точку записи
    // вместо начала — тот же формат разброса ±offset*0.2, что и у живого
    // эквалайзера в tick(), просто центр не всегда 0.
    const peakIdx = loudestFrameIndex(wd)
    barElsRef.current.forEach((bar, i) => {
      if (!bar) return
      const offset = Math.round((i - center) * 0.2)
      const idx    = Math.max(0, Math.min(wd.length - 1, peakIdx + offset))
      const amp    = Math.pow(wd[idx] / 255, 0.55)
      barSmoothRef.current[i] = amp
      bar.style.transform = `scaleY(${Math.max(0.1, amp * 1.8)})`
    })
  }

  // Show first frame before first play so there's no visual jump on start
  useLayoutEffect(() => { applyFirstFrame(waveData) }, [waveData, barCount])  

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (audioRef.current) audioRef.current.pause()
  }, [])

  // Кнопка показывает состояние САМОГО элемента, а не только своих нажатий.
  // Раньше isPlaying меняли лишь toggle() и onEnded, и остановленное со
  // стороны сообщение продолжало показывать ⏸ и «играющие» полосы: в
  // переписке звучит что-то одно (useSoloMedia), и запуск соседнего
  // голосового ставит это на паузу мимо toggle(). То же с дебаг-тулбаром.
  //
  // Слушаем сам элемент — тогда любой, кто его тронет, честно отражается в
  // кнопке, и новый источник паузы не потребует правок здесь.
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPause = () => { stopRAF(); setIsPlaying(false) }
    // Данные звука уже в элементе — с этого момента держимся за этот источник
    // и не реагируем на подмену blob→r2Url у того же файла
    const onLoaded = () => lockSrc(src)
    // Возобновление снаружи (тулбар снял заморозку): цикл кадров мы погасили
    // на паузе, поэтому поднимаем его обратно — иначе волна осталась бы
    // стоять, пока звук идёт
    const onPlay = () => {
      setIsPlaying(true)
      ensureTick()
    }
    audio.addEventListener('pause', onPause)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('loadeddata', onLoaded)
    // Файл мог загрузиться до того, как мы подписались (blob из предзагрузки
    // готов сразу) — события тогда уже не будет, проверяем состояние сами
    if (audio.readyState >= 2) onLoaded()
    return () => {
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('loadeddata', onLoaded)
    }
    // lockSrc стабилен (useCallback с пустыми deps) — подписку не пересобирает
  }, [src, lockSrc])

  // Один цикл кадров на элемент, и не больше. Возобновление приходит с двух
  // сторон сразу: событие 'play' и промис audio.play() — если каждая заведёт
  // свой rAF, дальше они будут перебивать друг друга через общий rafRef, и
  // волна с текстом начнут мерцать вдвое чаще нужного
  function ensureTick() {
    if (!rafRef.current && tickRef.current) rafRef.current = requestAnimationFrame(tickRef.current)
  }

  function stopRAF() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  function toggle() {
    const audio = audioRef.current
    pLog('AudioModule toggle — audio=', !!audio, 'src=', src ?? 'NULL', 'paused=', audio?.paused ?? 'n/a')
    if (!audio || !src) { pLog('AudioModule toggle: early return (no audio or no src)'); return }

    if (!audio.paused) {
      audio.pause()
      stopRAF()
      setIsPlaying(false)
      return
    }

    const isReplay = audio.ended
    if (isReplay) audio.currentTime = 0

    const d             = duration || audio.duration || 0
    const capturedWave  = waveData
    const capturedChars = charTimings

    setTextStarted(true)
    // Три случая, и путать их нельзя:
    //  · показывали целиком — оставляем целиком: повторный запуск старого
    //    голосового текст не перенабирает (из-за этого дёргалась лента);
    //  · запуск заново с начала — печатаем с нуля, как в первый раз;
    //  · ПРОДОЛЖЕНИЕ с паузы — не трогаем. Сброс в −1 схлопывал недопечатанный
    //    текст на кадр, следующий кадр возвращал обратно — это и было мигание
    //    при возврате к сообщению, которое не успело договорить.
    if (fullyRevealedRef.current) setRevealedCharIdx(capturedChars.length)
    else if (isReplay) setRevealedCharIdx(-1)
    // On replay: reset to first frame so EMA starts clean
    // On resume: keep current EMA values — no jump
    if (isReplay) applyFirstFrame(capturedWave)
    barElsRef.current.forEach(bar => {
      if (!bar) return
      bar.style.transition = ''  // remove any lingering fade transition
      // Заливку стираем ТОЛЬКО при запуске заново: на продолжении с паузы она
      // уже показывает пройденное, а обнуление гасило спектр на кадр — то же
      // мигание, что было у текста, только на полосах
      if (isReplay) bar.style.background = ''
    })

    function tick() {
      const ct        = audio.currentTime
      const total     = d || audio.duration || 1
      const progress  = total > 0 ? ct / total : 0
      const bars      = barElsRef.current
      const greenUpTo = progress * bars.length
      const center    = (bars.length - 1) / 2
      const fi        = !weakDevice && capturedWave?.length ? Math.floor(ct * WAVEFORM_FPS) : -1

      bars.forEach((bar, i) => {
        if (!bar) return
        bar.style.background = i < greenUpTo ? ACCENT : ''
        if (fi >= 0) {
          const offset = Math.round((i - center) * 0.2)
          const idx    = Math.max(0, Math.min(capturedWave.length - 1, fi + offset))
          const target = Math.pow(capturedWave[idx] / 255, 0.55)
          const alpha  = target > barSmoothRef.current[i] ? 0.75 : 0.28
          barSmoothRef.current[i] = barSmoothRef.current[i] * (1 - alpha) + target * alpha
          bar.style.transform = `scaleY(${Math.max(0.1, barSmoothRef.current[i] * 1.8)})`
        }
      })

      // Ведём раскрытие только на первом прогоне. На повторном текст уже
      // показан целиком, и трогать его нельзя: каждое изменение — новая
      // высота пузыря и сдвиг всей переписки
      if (capturedChars.length && !fullyRevealedRef.current) {
        let idx = -1
        for (let i = 0; i < capturedChars.length; i++) {
          if (ct >= capturedChars[i]) idx = i; else break
        }
        setRevealedCharIdx(idx)
      }

      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(Math.max(0, total - ct))
      rafRef.current = requestAnimationFrame(tick)
    }

    function onEnded() {
      stopRAF()
      setIsPlaying(false)
      if (capturedChars.length) {
        setRevealedCharIdx(capturedChars.length)
        // С этого момента текст считается показанным: повторные запуски
        // его больше не набирают (см. fullyRevealedRef)
        fullyRevealedRef.current = true
      }
      barElsRef.current.forEach(bar => {
        if (!bar) return
        bar.style.transition = 'background 0.55s ease'
        bar.style.background = ''
      })
      setTimeout(() => {
        barElsRef.current.forEach(bar => { if (bar) bar.style.transition = '' })
      }, 650)
      if (timeRef.current) timeRef.current.textContent = fmtAudioTime(d)
      onDone?.()
    }

    // Запоминаем цикл кадров: если элемент остановит и снова запустит кто-то
    // снаружи (сосед по переписке, дебаг-тулбар), возобновлять волну придётся
    // не отсюда — см. эффект синхронизации ниже
    tickRef.current = tick

    audio.addEventListener('ended', onEnded, { once: true })
    pLog('AudioModule: calling audio.play(), readyState=', audio.readyState, 'networkState=', audio.networkState)
    audio.play().then(() => {
      pLog('AudioModule: play() resolved OK')
      setIsPlaying(true)
      // ensureTick, а не свой rAF: событие 'play' уже могло поднять цикл,
      // и второй такой же дальше дрался бы с ним за общий rafRef
      ensureTick()
    }).catch(err => {
      pLog('AudioModule: play() ERROR —', err.name, err.message)
      console.warn('[AudioModule] play failed:', err.message)
      audio.removeEventListener('ended', onEnded)
      setIsPlaying(false)
      // Держались за источник, который уже не играет (Safari мог выгрузить
      // буфер, а blob к этому времени освободили) — отпускаем: пересчёт возьмёт
      // то, что доступно сейчас, обычно прямую ссылку на тот же файл.
      // NotAllowedError сюда не относится: это запрет автозапуска, а не
      // проблема с источником — файл цел, и сбрасывать его нельзя
      if (srcLocked && err.name !== 'NotAllowedError') {
        pLog('AudioModule: отпускаем зафиксированный источник и пробуем актуальный')
        unlockSrc()
      }
    })
  }

  const bubbleClass = [
    'playerMsgBubble', 'playerMsgBubble--audio',
    isFading ? 'playerMsgBubbleFading' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="playerMsgRow">
      <PlayerBubble className={bubbleClass}>
        {src && <audio ref={audioRef} src={src} preload="auto" />}
        <div className="playerAudio">
          <div className="playerAudioRow">
            <button
              className="playerAudioBtn"
              onClick={toggle}
              disabled={!src}
              aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
            >
              {isPlaying ? <PauseIcon /> : <PlayTriangle />}
            </button>
            <div className="playerAudioWaveCol">
              <div ref={waveRowRef} className="playerAudioWaveRow">
                {waveH.map((h, i) => (
                  <div
                    key={i}
                    ref={el => { barElsRef.current[i] = el }}
                    className={[
                      'playerAudioBar',
                      isPlaying && waveData ? 'playerAudioBarLive'
                        : isPlaying && !weakDevice ? 'playerAudioBarPlaying' : '',
                    ].filter(Boolean).join(' ')}
                    style={{ '--bar-h': h + 'px', '--delay': `${i * 0.07}s` }}
                  />
                ))}
              </div>
              <span ref={timeRef} className="playerAudioDur">{fmtAudioTime(duration)}</span>
            </div>
          </div>

          {text && textStarted && (
            <div className="playerAudioTextSection">
              <PlayerTypingText
                text={text}
                highlights={highlights}
                /* в заглушке таймингов нет — печатаем ровно за её длительность,
                   чтобы текст закончился к моменту перехода к следующей ноде */
                revealedCharIdx={!stubMode && charTimings.length ? revealedCharIdx : undefined}
                speed={stubMode ? stubSpeed : undefined}
                onTypingChange={active => { if (active) setIsFading(true) }}
              />
            </div>
          )}
        </div>
      </PlayerBubble>
    </div>
  )
}
