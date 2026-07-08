import { useState, useRef, useEffect } from 'react'
import { leaseVideo, releaseVideo, unlockAllForSound, kickSurface, rebuildSurface, prepareReturn } from './videoPool.js'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Видео-слой слайда — общий для «Рекомендаций» и «Моих уроков».
// Кто активен — решает родитель по позиции скролла (пропс active). Видео берётся
// из пула (videoPool): активный слайд играет, сосед (near) заранее держит своё
// видео загруженным и на первом кадре — поэтому при свайпе старт мгновенный,
// без ожидания загрузки. Элементы пула не пересоздаются, звук не гаснет.
// Тап по видео — пауза/продолжить (сбрасывается при уходе со слайда).
export default function SlideVideo({
  videoUrl, posterUrl, slideKey, active = false, near = false, tabVisible = true,
  soundOn = false, onSoundOn, onSoundBlocked, fallback = null,
}) {
  const [paused, setPaused] = useState(false)
  // Тик реального прикрепления элемента к слайду: когда перенос отложен (см.
  // ниже, «холодный» перенос), эффект воспроизведения должен перезапуститься
  // после фактического appendChild
  const [attachTick, setAttachTick] = useState(0)
  const rootRef = useRef(null)
  const kickRaf = useRef(0)
  const attachRaf = useRef(0)
  const hasVideo = !!videoUrl
  // В «окне» = активный или сосед. Только для них держим элемент пула.
  const inWindow = active || near

  // Аренда элемента пула и загрузка своего src. Пока слайд в окне — элемент
  // живёт внутри него. Смена active↔near сюда не входит (inWindow один и тот
  // же), поэтому элемент не дёргается туда-сюда. При новом src прячем видео
  // (opacity:0) — иначе на переиспользованном элементе мелькнул бы чужой кадр;
  // пока скрыто, виден постер, который лежит под видео.
  useEffect(() => {
    if (!hasVideo || !tabVisible || !inWindow) return
    const v = leaseVideo(slideKey)
    const root = rootRef.current
    if (!root) return
    // Реальный перенос элемента в этот слайд. Элемент, который прямо сейчас
    // паркуется (parkPending — быстрый переход между вкладками), забираем
    // только через кадр, ХОЛОДНЫМ: синхронный перенос только что игравшего
    // <video> — источник iOS-стоп-кадра при живом звуке. needsKick — страховка
    // поверх этого (пинок после переноса, см. эффект воспроизведения).
    if (v.parentElement !== root) {
      const attach = () => {
        root.appendChild(v)
        v.dataset.needsKick = '1'
      }
      if (v.dataset.parkPending === '1') {
        attachRaf.current = requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!rootRef.current || v.parentElement === rootRef.current) return
          attach()
          setAttachTick(t => t + 1)
        }))
      } else {
        attach()
      }
    }
    if (v.dataset.url !== videoUrl) {
      v.dataset.url = videoUrl
      v.src = videoUrl
      try { v.currentTime = 0 } catch { /* не критично */ }
      v.style.transition = 'none'
      v.style.opacity = '0'
    }
    // Уход из окна/с вкладки: releaseVideo паркует (пауза сразу, перенос и
    // подготовка возврата — кадром позже, на холодном элементе, см. videoPool)
    return () => {
      cancelAnimationFrame(attachRaf.current)
      releaseVideo(slideKey)
    }
  }, [hasVideo, tabVisible, inWindow, videoUrl, slideKey])

  // Активный слайд: звук + воспроизведение + плавное появление. Сосед: молча
  // прогревается (muted, пауза, первый кадр уже загружен). Позицию элемента в
  // DOM здесь не трогаем — только его состояние.
  useEffect(() => {
    if (!hasVideo || !tabVisible || !inWindow) return
    const v = leaseVideo(slideKey)
    if (v.parentElement !== rootRef.current) return

    if (!active) {
      // Прогрев соседа: тихо, на паузе. opacity не трогаем — если элемент уже
      // показывал кадр этого слайда, пусть остаётся показанным. Слайд, с
      // которого только что уехали (остался соседом), тоже готовим к возврату,
      // но с задержкой: seek прямо в момент свайпа дёргает iOS-скролл
      // (свайп «не доводился» до снапа)
      v.muted = true
      v.pause()
      const prep = setTimeout(() => prepareReturn(v), 400)
      return () => clearTimeout(prep)
    }

    v.muted = !soundOn
    // Появление: если видео скрыто (свежий/чужой кадр) — показываем не на
    // нулевом кадре, а через пару реально показанных кадров (туда, где примерно
    // постер) и плавным фейдом, чтобы не было отката «постер → кадр 0». Если
    // элемент уже показан (сосед прогрелся) — сразу играем, без задержки.
    let shown = v.style.opacity === '1'
    let rvfc = 0
    let frames = 0
    // real=true — на экране реальный кадр видео (не страховочный показ по
    // таймеру): сигналим ленте, что стартовый сплэш может улетать
    const reveal = (real) => {
      if (shown) return
      shown = true
      v.style.transition = 'opacity 140ms ease'
      v.style.opacity = '1'
      if (real) window.__pithyVideoShown?.()
    }
    const revealReal = () => reveal(true)
    if (!shown) {
      if (v.requestVideoFrameCallback) {
        const onFrame = () => {
          if (++frames >= 3) revealReal()
          else rvfc = v.requestVideoFrameCallback(onFrame)
        }
        rvfc = v.requestVideoFrameCallback(onFrame)
      } else {
        v.addEventListener('seeked', revealReal, { once: true })
        v.addEventListener('loadeddata', revealReal, { once: true })
      }
    }
    const safety = setTimeout(reveal, 500)

    // Заблокированный автоплей БЕЗ звука (iOS Low Power Mode, экономия
    // трафика): пробуем ещё раз, когда данные доехали, а если снова нет —
    // показываем кнопку Play вместо молча застывшего кадра
    const retryPlay = () => { v.play().catch(() => setPaused(true)) }
    if (!paused && v.dataset.freeze !== '1') {
      v.play().catch((err) => {
        // AbortError — это наш же «пинок» (pause→play) прервал предыдущий
        // play(); звук тут ни при чём, глушить нельзя (иначе видео немеет при
        // переходе между вкладками)
        if (err && err.name === 'AbortError') return
        // Элемент ещё не «благословлён» звуком — играем без него
        if (!v.muted) {
          v.muted = true
          v.play().catch(() => {})
          onSoundBlocked?.()
          return
        }
        fdbg(`vid ${(videoUrl || '').slice(-8)} muted autoplay blocked (${err && err.name}) rs=${v.readyState}`)
        if (err && err.name === 'NotAllowedError') setPaused(true)
        else if (v.readyState < 3) v.addEventListener('canplay', retryPlay, { once: true })
        else setPaused(true)
      })
      // iOS: если элемент только что перенесли в этот слайд — на следующем
      // кадре «пинаем» поверхность СИЛЬНЫМ пинком (pause→seek→play, см.
      // kickSurface): перенос <video> во время проигрывания оставляет
      // стоп-кадр при живом звуке, причём декодер работает (rvfc идёт) — без
      // seek компоузер так и показывает старый кадр. Флаг needsKick снимаем
      // только КОГДА пинок реально сделан: при частых переходах rAF отменялся
      // очисткой эффекта, а флаг уже был снят — пинок терялся навсегда
      if (v.dataset.needsKick === '1') {
        kickRaf.current = requestAnimationFrame(() => {
          if (v.parentElement === rootRef.current && !v.paused && v.dataset.freeze !== '1') {
            v.dataset.needsKick = ''
            fdbg(`vid ${(videoUrl || '').slice(-8)} kick после переноса (seek) ct=${v.currentTime.toFixed(2)}`)
            kickSurface(v)
          }
        })
      }
    } else {
      v.pause()
    }

    // Сторож стоп-кадра (страховка поверх пинка): видео «играет» (звук идёт),
    // а новые кадры не приходят — известный iOS-эффект после переноса <video>.
    // Считаем кадры через rvfc; если их нет 450мс+ при играющем видео —
    // пинаем pause→play, максимум 3 раза (и честно пишем в DBG-лог)
    let lastFrame = performance.now()
    let wdRvfc = 0
    let wdKicks = 0
    let wdStall = 0
    let wdTimer = 0
    if (v.requestVideoFrameCallback && !paused) {
      const onWdFrame = () => { lastFrame = performance.now(); wdRvfc = v.requestVideoFrameCallback(onWdFrame) }
      wdRvfc = v.requestVideoFrameCallback(onWdFrame)
      wdTimer = setInterval(() => {
        if (document.hidden || v.paused || v.parentElement !== rootRef.current) { wdStall = 0; return }
        // Во время свайпа rvfc законно молчит (iOS душит колбэки при скролле),
        // а пинки-сики в этот момент ломают доводку снапа — молчим (флаг
        // scrolling ставит onScroll в FeedTab)
        const sc = rootRef.current.closest('.feedV2Scroll')
        if (sc && sc.dataset.scrolling === '1') { wdStall = 0; return }
        if (performance.now() - lastFrame < 450) { wdStall = 0; return }
        // Пинаем только после двух «пустых» тиков подряд (~1с без кадров) —
        // меньше ложных срабатываний сразу после скролла/переноса
        if (++wdStall < 2) return
        wdStall = 0
        wdKicks++
        if (wdKicks > 3) {
          fdbg(`vid ${(videoUrl || '').slice(-8)} watchdog: не помогло — сдаюсь`)
          clearInterval(wdTimer)
          return
        }
        fdbg(`vid ${(videoUrl || '').slice(-8)} watchdog: кадры стоят при звуке — ${wdKicks < 3 ? `пинок №${wdKicks} (seek)` : 'пересборка'} ct=${v.currentTime.toFixed(2)} rs=${v.readyState}`)
        if (wdKicks < 3) kickSurface(v)
        else rebuildSurface(v)
      }, 500)
    }

    return () => {
      clearTimeout(safety)
      clearInterval(wdTimer)
      cancelAnimationFrame(kickRaf.current)
      if (rvfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(rvfc)
      if (wdRvfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(wdRvfc)
      v.removeEventListener('seeked', revealReal)
      v.removeEventListener('loadeddata', revealReal)
      v.removeEventListener('canplay', retryPlay)
    }
  }, [hasVideo, tabVisible, inWindow, active, soundOn, paused, slideKey, videoUrl, attachTick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ушли со слайда — ручная пауза сбрасывается
  useEffect(() => {
    if (active || !paused) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaused(false)
  }, [active, paused])

  // Включение звука по жесту: разблокируем звук на ВСём пуле (чтобы соседние
  // видео тоже могли играть со звуком), затем включаем звук здесь
  function activateSound() {
    unlockAllForSound()
    if (slideKey !== undefined) {
      const v = leaseVideo(slideKey)
      v.muted = false
      v.play().catch(() => {})
    }
    onSoundOn?.()
  }

  function tapSound(e) {
    e.stopPropagation()
    activateSound()
  }

  // Тап по видео: пока звук не включён — первый тап именно включает звук (а не
  // ставит паузу), даже мимо чипа. Когда звук уже включён — тап это пауза/пуск.
  function onRootClick() {
    if (!active) return
    if (!soundOn) { activateSound(); return }
    setPaused(p => !p)
  }

  if (!hasVideo) return fallback

  return (
    <div className="slideVideoRoot" ref={rootRef} onClick={onRootClick}>
      {posterUrl
        ? <div className="feedPosterBg" style={{ backgroundImage: `url("${posterUrl}")` }} />
        : <div className="feedSkeleton" />}
      {paused && active && (
        <div className="slidePauseIcon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7L8 5z" /></svg>
        </div>
      )}
      {!soundOn && active && (
        <button className="feedSoundChip" onClick={tapSound}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
          Включить звук
        </button>
      )}
    </div>
  )
}
