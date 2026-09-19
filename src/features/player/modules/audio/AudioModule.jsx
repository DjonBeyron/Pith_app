import { useState, useEffect, useRef, useMemo } from 'react'
import PlayerBubble from '../../PlayerBubble.jsx'
import AudioWave from './AudioWave.jsx'
import { PlayTriangle, PauseIcon } from './AudioPlayIcons.jsx'
import PlayerTypingText from '../../PlayerTypingText.jsx'
import { analyzeWaveform, fmtAudioTime, probeAudioDuration } from '../../../../shared/lib/audioUtils.js'
import { pLog } from '../../../../shared/lib/debug.js'
import { buildCharTimings } from '../../../../shared/lib/charTimings.js'
import { usePlayedOffset, playedOffsetMs } from '../../usePlayedOffset.js'
import { useMissingMediaFallback, FALLBACK_MS } from '../../useMissingMediaFallback.js'
import { useAudioSource } from './useAudioSource.js'
import { logAudioMount, logAudioDurationReady, logAudioPlayStart, makeAudioHeartbeat, logAudioEnded } from './audioDebug.js'

// Волна — один canvas (AudioWave.jsx), спектр статичен всегда: живой
// эквалайзер на ~70 div-полосках с will-change был главным источником
// нагрева и лагов на длинных уроках (см. audioWaveParts.js)
export default function AudioModule({ node, file, onDone, adminPreview = false, pending = false }) {
  const [isPlaying,       setIsPlaying]       = useState(false)
  // Сразу true, если у голосового есть расшифровка: пузырь должен прилететь
  // в чат уже растушёванным. Раньше растушёвка включалась по старту печати —
  // сообщение появлялось с резким низом и щёлкало в размытый через секунду.
  // Ленивая инициализация, потому что node.typeData разбирается ниже
  const [isFading,        setIsFading]        = useState(() => !!node.typeData?.audio?.text)
  // Сохранённые длительность/волна — сразу в начальном состоянии, не в эффекте:
  // тот срабатывает ПОСЛЕ первой отрисовки, и первый кадр показывал таймер с
  // нулём, который тут же менялся на настоящий (видно на въезде голосового)
  const [waveData,        setWaveData]        = useState(() => node.typeData?.audio?.waveformData?.length ? node.typeData.audio.waveformData : null)
  const [duration,        setDuration]        = useState(() => node.typeData?.audio?.duration || null)
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
  // Ручка волны: setProgress(0..1) — см. AudioWave.jsx
  const waveRef         = useRef(null)

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
    logAudioMount({ src, storedWaveform, storedDuration })
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
    // Сброс медиасостояния при смене src — осознанный setState в эффекте
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsPlaying(false)
    setTextStarted(false)
    setRevealedCharIdx(-1)
    waveRef.current?.setProgress(0)
    setWaveData(storedWaveform?.length ? storedWaveform : null)
    setDuration(storedDuration || null)
    if (storedDuration) logAudioDurationReady('сразу, storedDuration', storedDuration)
    if (!src) { pLog('AudioModule: src is null, skipping load'); return }
    let cancelled = false
    if (!storedWaveform?.length) {
      analyzeWaveform(src).then(wd => { if (!cancelled) setWaveData(wd) }).catch(() => {})
    }
    if (!storedDuration) {
      probeAudioDuration(src).then(d => {
        if (cancelled || !d || !isFinite(d)) return
        setDuration(d)
        logAudioDurationReady('асинхронно, probeAudioDuration', d)
      }).catch(() => {})
    }
    return () => { cancelled = true }
  }, [src, storedWaveform, storedDuration])

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
    const capturedChars = charTimings
    logAudioPlayStart({ d, liveDuration: audio.duration, readyState: audio.readyState, networkState: audio.networkState, waveLen: waveData?.length })
    const hb = makeAudioHeartbeat()

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
    // Заливку стираем ТОЛЬКО при запуске заново: на продолжении с паузы она
    // уже показывает пройденное
    if (isReplay) waveRef.current?.setProgress(0)

    function tick() {
      const ct = audio.currentTime
      // audio.duration живого элемента приоритетнее заранее сохранённой d:
      // у отдельного probeAudioDuration()-элемента метаданные MP3 иногда чуть
      // короче реальных (VBR) — на коротких голосовых это заметный процент,
      // заливка добегала до края раньше, чем звук реально доигрывал
      const total    = (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : d) || 1
      const progress = total > 0 ? ct / total : 0
      hb(ct, total)
      // Сама волна перерисуется только если заливка дошла до новой полоски
      waveRef.current?.setProgress(progress)

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

      // Таймер меняется раз в секунду — не трогаем DOM, пока строка та же
      const left = fmtAudioTime(Math.max(0, total - ct))
      if (timeRef.current && timeRef.current.textContent !== left) timeRef.current.textContent = left
      rafRef.current = requestAnimationFrame(tick)
    }

    function onEnded() {
      logAudioEnded({ ct: audio.currentTime, liveDuration: audio.duration, d })
      stopRAF()
      setIsPlaying(false)
      if (capturedChars.length) {
        setRevealedCharIdx(capturedChars.length)
        // С этого момента текст считается показанным: повторные запуски
        // его больше не набирают (см. fullyRevealedRef)
        fullyRevealedRef.current = true
      }
      waveRef.current?.setProgress(0)
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
    // Без расшифровки — фиксированная ширина (25vw), а не fit-content по
    // содержимому волны: без текста-«призрака» единственное, что могло бы
    // влиять на fit-content, — сама дорожка волны, а её плотность (barCount)
    // пересчитывается ПОСЛЕ первого кадра (ResizeObserver в AudioModule.jsx)
    // и на момент первого paint ещё не знает финальную ширину — из-за этого
    // пузырь долю секунды рисовался wider, потом скакал к 25vw. Явная
    // фиксированная ширина убирает саму возможность этой обратной связи.
    !text ? 'playerMsgBubble--audioNoText' : '',
    isFading ? 'playerMsgBubbleFading' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="playerMsgRow">
      <PlayerBubble className={bubbleClass}>
        {src && <audio ref={audioRef} src={src} preload="auto" />}
        <div className="playerAudio">
          {/* Призрак полного текста — держит финальную ширину пузыря СРАЗУ,
              с первого рендера, даже пока сама расшифровка ещё не появилась
              (text && textStarted ниже) — без него пузырь стартовал бы
              узким и скакал шире в момент появления текста (тот же приём,
              что у .trGhost в TextModule.jsx). Переносы строк (\n) заменены
              на пробел и меряются В ОДНУ строку (nowrap, не pre) — иначе
              автор, разбивший длинную реплику на несколько КОРОТКИХ строк
              для ритма чтения, получал бы узкий пузырь по самой короткой
              из них, хотя текста внутри много. Сама видимая расшифровка
              (.playerAudioTextSection ниже) переносы всё равно сохраняет —
              меняется только то, ПО ЧЕМУ считается ширина пузыря. */}
          {text && <div className="playerAudioTextGhost" aria-hidden="true">{text.replace(/\n/g, ' ')}</div>}
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
              <AudioWave ref={waveRef} waveData={waveData} />
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
