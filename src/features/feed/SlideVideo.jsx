import { useState, useRef, useEffect } from 'react'
import { leaseVideo, releaseVideo, unlockAllForSound } from './videoPool.js'
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
  const rootRef = useRef(null)
  const kickRaf = useRef(0)
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
    // Реальный перенос элемента в этот слайд помечаем: на iOS перенос <video>
    // во время проигрывания застывает картинку (звук идёт) — активный слайд
    // потом «пинает» поверхность pause→play (см. эффект воспроизведения)
    if (v.parentElement !== root) { root.appendChild(v); v.dataset.needsKick = '1' }
    if (v.dataset.url !== videoUrl) {
      v.dataset.url = videoUrl
      v.src = videoUrl
      try { v.currentTime = 0 } catch { /* не критично */ }
      v.style.transition = 'none'
      v.style.opacity = '0'
    }
    return () => { releaseVideo(slideKey) }
  }, [hasVideo, tabVisible, inWindow, videoUrl, slideKey])

  // Повторный приезд на слайд: короткое видео (< 10с) начинаем сначала, длинное
  // — продолжаем с места (элемент пула хранит currentTime). Только в момент
  // становления активным (deps без soundOn/paused), иначе тап звука/паузы
  // перематывал бы в начало.
  useEffect(() => {
    if (!active || !hasVideo || !tabVisible) return
    const v = leaseVideo(slideKey)
    if (v.parentElement !== rootRef.current) return
    const d = v.duration
    const restart = !Number.isFinite(d) || d < 10
    if (restart) {
      try { v.currentTime = 0 } catch { /* не критично */ }
    }
    fdbg(`vid ${(videoUrl || '').slice(-8)} active dur=${Number.isFinite(d) ? d.toFixed(1) : '?'} rs=${v.readyState} → ${restart ? 'restart' : 'continue'}`)
  }, [active, hasVideo, tabVisible, slideKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Активный слайд: звук + воспроизведение + плавное появление. Сосед: молча
  // прогревается (muted, пауза, первый кадр уже загружен). Позицию элемента в
  // DOM здесь не трогаем — только его состояние.
  useEffect(() => {
    if (!hasVideo || !tabVisible || !inWindow) return
    const v = leaseVideo(slideKey)
    if (v.parentElement !== rootRef.current) return

    if (!active) {
      // Прогрев соседа: тихо, на паузе. opacity не трогаем — если элемент уже
      // показывал кадр этого слайда, пусть остаётся показанным.
      v.muted = true
      v.pause()
      return
    }

    v.muted = !soundOn
    // Появление: если видео скрыто (свежий/чужой кадр) — показываем не на
    // нулевом кадре, а через пару реально показанных кадров (туда, где примерно
    // постер) и плавным фейдом, чтобы не было отката «постер → кадр 0». Если
    // элемент уже показан (сосед прогрелся) — сразу играем, без задержки.
    let shown = v.style.opacity === '1'
    let rvfc = 0
    let frames = 0
    const reveal = () => {
      if (shown) return
      shown = true
      v.style.transition = 'opacity 140ms ease'
      v.style.opacity = '1'
    }
    if (!shown) {
      if (v.requestVideoFrameCallback) {
        const onFrame = () => {
          if (++frames >= 3) reveal()
          else rvfc = v.requestVideoFrameCallback(onFrame)
        }
        rvfc = v.requestVideoFrameCallback(onFrame)
      } else {
        v.addEventListener('seeked', reveal, { once: true })
        v.addEventListener('loadeddata', reveal, { once: true })
      }
    }
    const safety = setTimeout(reveal, 500)

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
        }
      })
      // iOS: если элемент только что перенесли в этот слайд — на следующем
      // кадре «пинаем» поверхность pause→play. Без этого перенос <video> во
      // время проигрывания оставляет стоп-кадр при живом звуке (баг перехода
      // между вкладками «Мои уроки» ↔ «Рекомендации»)
      if (v.dataset.needsKick === '1') {
        v.dataset.needsKick = ''
        kickRaf.current = requestAnimationFrame(() => {
          if (v.parentElement === rootRef.current && !v.paused && v.dataset.freeze !== '1') {
            v.pause()
            v.play().catch(() => {})
          }
        })
      }
    } else {
      v.pause()
    }

    return () => {
      clearTimeout(safety)
      cancelAnimationFrame(kickRaf.current)
      if (rvfc && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(rvfc)
      v.removeEventListener('seeked', reveal)
      v.removeEventListener('loadeddata', reveal)
    }
  }, [hasVideo, tabVisible, inWindow, active, soundOn, paused, slideKey, videoUrl]) // eslint-disable-line react-hooks/exhaustive-deps

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
