import { useCallback, useEffect, useRef, useState } from 'react'

// Длительность исчезновения подсказки (см. .wtLayerClosing в
// feed-word-translate.css) — столько живёт слой после закрытия
const CLOSE_MS = 130

// Состояние пословного перевода в слайде ленты: какое слово открыто, где оно
// лежит внутри слайда и каким переводом подписано.
//
// Правила тапов (из задачи): тап по тому же слову или по самому переводу —
// закрыть; тап по другому слову — старый перевод исчезает, новый появляется
// (новый id → слой перемонтируется и анимация проигрывается заново).
//
// hostRef — сам слайд (.feedSlide): координаты слова считаем относительно
// него, потому что слой перевода лежит внутри слайда.
export function useWordTranslate(hostRef) {
  const [pick, setPick] = useState(null) // { index, text, x, y, hostW, id, closing }
  const pickRef = useRef(null)
  const timerRef = useRef(null)
  const seqRef = useRef(0)

  useEffect(() => { pickRef.current = pick }, [pick])
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const close = useCallback(() => {
    const cur = pickRef.current
    if (!cur || cur.closing) return
    clearTimeout(timerRef.current)
    setPick({ ...cur, closing: true })
    timerRef.current = setTimeout(() => setPick(null), CLOSE_MS)
  }, [])

  // Тап куда угодно мимо слова и мимо самой подложки закрывает подсказку — и
  // только закрывает: этот тап целиком съедается (глушим его pointerup и
  // click тоже), иначе одним касанием и перевод убирался бы, и срабатывало
  // то, что под пальцем — плей/пауза видео, кнопка HUD. Следующий тап уже
  // работает как обычно. Слова и подложку исключаем — у них своя логика
  // (переключить/закрыть).
  // Слушатели вешаются один раз и читают pickRef: если бы эффект зависел от
  // pick, close() пересоздал бы его и снял бы глушители до прихода click
  useEffect(() => {
    let eating = false
    function onDown(e) {
      eating = false
      const cur = pickRef.current
      if (!cur || cur.closing) return
      const t = e.target
      if (t && t.closest && t.closest('.fwWord, .wtPlate')) return
      close()
      eating = true
      e.stopPropagation()
    }
    function onLate(e) {
      if (!eating) return
      if (e.type === 'click') eating = false
      e.stopPropagation()
      e.preventDefault()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('pointerup', onLate, true)
    document.addEventListener('click', onLate, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('pointerup', onLate, true)
      document.removeEventListener('click', onLate, true)
    }
  }, [close])

  const pickWord = useCallback((index, text, el) => {
    const cur = pickRef.current
    if (cur && cur.index === index && !cur.closing) { close(); return }
    const host = hostRef.current
    if (!host) return
    const hr = host.getBoundingClientRect()
    const wr = el.getBoundingClientRect()
    // Верх блока фразы — от него отсчитывается уровень горизонтали, чтобы
    // перевод любого слова оказывался на одной и той же высоте (а не «над
    // своим» словом): у слов на второй строке фразы просто длиннее диагональ
    const block = el.closest('.feedPhraseBlock')
    const br = block ? block.getBoundingClientRect() : wr
    clearTimeout(timerRef.current)
    seqRef.current += 1
    setPick({
      index,
      text,
      id: seqRef.current,
      // Линия стартует от середины верхней грани слова
      x: wr.left + wr.width / 2 - hr.left,
      y: wr.top - hr.top,
      blockTop: br.top - hr.top,
      hostW: hr.width,
    })
  }, [hostRef, close])

  return { pick, pickWord, close }
}
