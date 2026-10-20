import { useState, useEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { pLog } from '../../../../shared/lib/debug.js'

// Голосовое, чей файл не загрузился (R2 отдал HTTP 404, оборвалась сеть): <audio> молча получает error, а play() отвечает
// NotSupportedError. Раньше кнопка оставалась обычным ▶ и «ничего не делала» — загрузки не видно, урок стоял на этой ноде.
//
// Порядок: первая ошибка → кнопка показывает «не загрузилось» (↻) и через AUTO_RETRY_MS САМ идёт один повтор с меткой в адресе
// (_r=…, обход кэша, у blob адрес прежний — тот же элемент грузится заново) + onRetry (модуль зовёт play()); тап раньше таймера —
// тот же повтор в касании. Вторая ошибка → сдаёмся и отпускаем урок (onGiveUp: AudioModule печатает расшифровку по таймеру и
// завершает ноду, как заглушка админа), чтобы урок обычного ученика не стоял из-за одного файла (решение автора, 2026-10-21).
const withBust = (src, token) => (!src || !token || src.startsWith('blob:') ? src : `${src}${src.includes('?') ? '&' : '?'}_r=${token}`)

export const AUTO_RETRY_MS = 700

export function useAudioLoadFail(audioRef, src, elKey, { onFail, onGiveUp, onRetry }) {
  const [failed, setFailed] = useState(false)
  const [token, setToken] = useState('')
  const triesRef = useRef(0)      // сколько повторов уже было (максимум 1)
  const gaveUpRef = useRef(false) // сдались: дальше тапы ничего не делают
  const cbRef = useRef({ onFail, onGiveUp, onRetry, retry: () => false }) // актуальные колбэки и retry — заполняются эффектом ниже
  const autoRef = useRef(null)

  const fail = useCallback(why => {
    pLog(`[audio-load] не загрузилось (${why}), повторов было ${triesRef.current}`)
    setFailed(true)
    cbRef.current.onFail?.()
    if (triesRef.current >= 1 && !gaveUpRef.current) { gaveUpRef.current = true; cbRef.current.onGiveUp?.(); return }
    // Автоповтор без тапа: ученик не обязан понимать значок ↻
    clearTimeout(autoRef.current)
    autoRef.current = setTimeout(() => { if (cbRef.current.retry()) cbRef.current.onRetry?.() }, AUTO_RETRY_MS)
  }, [])
  useEffect(() => () => clearTimeout(autoRef.current), [])

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
    clearTimeout(autoRef.current)
    triesRef.current = 1
    const t = String(Date.now())
    flushSync(() => { setToken(t); setFailed(false) })
    if (!src || src.startsWith('blob:')) a.load()
    pLog(`[audio-load] повтор по тапу: ${withBust(src, t)}`)
    return true
  }, [audioRef, src])

  useEffect(() => { cbRef.current = { onFail, onGiveUp, onRetry, retry } })

  return { failed, elSrc: withBust(src, token), retry, fail, gaveUp: () => gaveUpRef.current }
}
