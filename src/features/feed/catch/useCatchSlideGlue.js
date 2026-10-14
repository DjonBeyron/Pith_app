import { useEffect, useCallback } from 'react'
import { countKeyRender, setCatchMounted } from '../spoilerStats.js'

const PHRASE_OPENED_DELAY_MS = 260 // после размонтирования накрытия: тяжёлые побочные эффекты открытия (onPhraseOpened) — не в кадрах ухода

// Склейка «Ловли слов» (useSlideCatch) с оболочкой слайда FeedSlide: всё, что слайд делает «по событиям» накрытия, но что не
// относится к разметке. Вынесено из FeedSlide.jsx, чтобы тот оставался в мягком лимите 250 строк.
//  - счётчики DBG-сводки (spoilerStats): рендеры слайда, пока накрытие открыто; флаг «накрытие в DOM»;
//  - высота накрытия → CSS-переменная слайда (--catch-cover-h) прямо через style.setProperty, без setState: иначе каждое
//    измерение перерисовывало бы весь слайд (видео, HUD, фраза). CatchCover шлёт 0 при закрытии/размонтировании, до первого
//    открытия переменной нет — в CSS fallback 0px. follow=true — высота меняется кадр за кадром (клавиатура сворачивается
//    на «Проверить»): иконки едут без собственного перехода (--catch-icon-ms: 0), иначе — плавно 260мс (feed-catch.css);
//  - принудительное задание админа (ct.forced) на уже открытой в этой сессии фразе — закрываем её обратно, иначе задание
//    негде показать (чип живёт только над шариками);
//  - сигнал ленте «фраза открыта» (и состояние, если не успели подготовить) — после ухода накрытия (ct.finished), таймером.
export function useCatchSlideGlue({ ct, rootRef, opened, setRevealed, onPhraseOpened }) {
  useEffect(() => { if (ct.mounted) countKeyRender() })
  useEffect(() => {
    if (!ct.mounted) return
    setCatchMounted(true)
    return () => setCatchMounted(false)
  }, [ct.mounted])

  const setCoverH = useCallback((h, follow = false) => {
    const st = rootRef.current?.style
    if (!st) return
    st.setProperty('--catch-cover-h', `${h}px`)
    st.setProperty('--catch-icon-ms', follow ? '0ms' : '260ms')
  }, [rootRef])

  useEffect(() => {
    if (!ct.forced || !opened || ct.done) return
    const t = setTimeout(() => setRevealed(false), 0)
    return () => clearTimeout(t)
  }, [ct.forced]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ct.finished) return
    const t = setTimeout(() => { setRevealed(true); onPhraseOpened?.() }, PHRASE_OPENED_DELAY_MS)
    return () => clearTimeout(t)
  }, [ct.finished]) // eslint-disable-line react-hooks/exhaustive-deps

  return { setCoverH }
}
