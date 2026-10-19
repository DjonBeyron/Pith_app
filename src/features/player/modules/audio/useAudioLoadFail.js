import { useState, useEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { pLog } from '../../../../shared/lib/debug.js'

// Голосовое, чей файл не загрузился (R2 отдал HTTP 404, оборвалась сеть): <audio> молча получает error, а play() отвечает
// NotSupportedError. Раньше кнопка оставалась обычным ▶ и «ничего не делала» — загрузки не видно, урок стоял на этой ноде.
//
// Порядок: первая ошибка → кнопка показывает «не загрузилось» (↻); тап → ОДИН повтор с меткой в адресе (_r=…, обход кэша,
// у blob адрес прежний — тот же элемент грузится заново) и сразу play() в том же касании; вторая ошибка → сдаёмся и
// отпускаем урок (onGiveUp: расшифровка показывается целиком, нода завершается), чтобы он не стоял из-за одного файла.
const withBust = (src, token) => (!src || !token || src.startsWith('blob:') ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${token}`)

export function useAudioLoadFail(audioRef, src, elKey, { onFail, onGiveUp }) {
  const [failed, setFailed] = useState(false)
  const [token, setToken] = useState('')
  const triesRef = useRef(0)      // сколько повторов уже было (максимум 1)
  const gaveUpRef = useRef(false) // сдались: дальше тапы ничего не делают
  const cbRef = useRef({ onFail, onGiveUp })
  useEffect(() => { cbRef.current = { onFail, onGiveUp } })

  const fail = useCallback(why => {
    pLog(`[audio-load] не загрузилось (${why}), повторов было ${triesRef.current}`)
    setFailed(true)
    cbRef.current.onFail?.()
    if (triesRef.current >= 1 && !gaveUpRef.current) { gaveUpRef.current = true; cbRef.current.onGiveUp?.() }
  }, [])

  // Новый адрес = новая жизнь: счётчики сбрасываются
  useEffect(() => {
    triesRef.current = 0; gaveUpRef.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false); setToken('')
  }, [src])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onErr = () => fail('error')
    const onOk = () => setFailed(false)
    a.addEventListener('error', onErr)
    a.addEventListener('loadeddata', onOk)
    a.addEventListener('playing', onOk)
    // Элемент мог упасть ещё до подписки (быстрый 404)
    if (a.error) fail('error до подписки')
    return () => { a.removeEventListener('error', onErr); a.removeEventListener('loadeddata', onOk); a.removeEventListener('playing', onOk) }
  }, [audioRef, src, elKey, fail])

  // Один повтор из тапа: true — можно сразу вызывать play() (адрес уже обновлён синхронно, жест не потерян)
  const retry = useCallback(() => {
    const a = audioRef.current
    if (!a || triesRef.current >= 1) return false
    triesRef.current = 1
    const t = String(Date.now())
    flushSync(() => { setToken(t); setFailed(false) })
    if (!src || src.startsWith('blob:')) a.load()
    pLog(`[audio-load] повтор по тапу: ${withBust(src, t)}`)
    return true
  }, [audioRef, src])

  return { failed, elSrc: withBust(src, token), retry, fail, gaveUp: () => gaveUpRef.current }
}
