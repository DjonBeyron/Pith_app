import { useState } from 'react'
import { flyPanelToChat } from './flyPanelToChat.js'
import { tracePanelSync, tracePanelPaint } from './tracePanelSync.js'

// Уход таблицы в переписку — общий для авто- и ручного режима. Раньше этот
// кусок был скопирован в обе панели целиком, и любая правка (компенсация
// распорки, трассы, порядок setState) требовала одинаковых изменений в двух
// местах; TableDictatorPanel.jsx на этом перешагнул потолок в 400 строк.
//
// Хук держит три состояния распорки под лентой:
//   toChat         — панель уходит не вниз, а превращается в сообщение;
//   givenToBubble  — сколько места распорка отдала пузырю в момент вставки;
//   spacerReleased — остаток уже поехал в ноль (кадром позже компенсации).
// Как они складываются в высоту — см. spacerStyle.js.
export function useTableToChat(label, spacerSel) {
  const [toChat, setToChat] = useState(false)
  const [givenToBubble, setGivenToBubble] = useState(null)
  const [spacerReleased, setSpacerReleased] = useState(false)

  // panelEl — живая панель (с неё снимается клон), done — завершение ноды
  function sendToChat(panelEl, nodeId, { send, reveal, done }) {
    setToChat(true)
    tracePanelPaint(`${label}-уход`, panelEl)
    tracePanelSync(`${label}-уход`, panelEl, spacerSel)
    flyPanelToChat(panelEl, nodeId, {
      send,
      reveal,
      onLanded: done,
      onRelease: playRelease,
      onCompensate: h => setGivenToBubble(h),
      settleLayout,
    })
  }

  // Приводим раскладку к КОНЕЧНОМУ виду ещё до превращения и сразу же
  // маскируем сдвиг трансформом. Зачем так:
  //
  //  · мерить цель, пока распорка ещё держит место, нельзя — пузырь стоит не
  //    там, где окажется, и любая поправка «на будущее» превращается в гонку:
  //    результат зависит от того, в какой микромомент сработал замер;
  //  · анимировать саму высоту распорки тоже нельзя — это layout, он
  //    пересчитывается каждый кадр и на экране даёт рывок.
  //
  // Поэтому: высоту снимаем разом (layout сразу финальный, пузырь на своём
  // месте — меряй сколько хочешь), а видимый сдвиг гасим трансформом на
  // .playerFeedInner, который потом плавно уводим в ноль. Трансформ
  // композитится на GPU, как и превращение клона.
  //
  // Лента перевёрнута через scaleY(-1), поэтому переворот сохраняем в каждом
  // кадре, а знак сдвига в этой системе обратный: чтобы удержать историю на
  // прежнем месте после снятия распорки, нужен ОТРИЦАТЕЛЬНЫЙ translateY.
  function settleLayout() {
    const spacer = document.querySelector(spacerSel)
    const drop = spacer ? Math.round(spacer.getBoundingClientRect().height) : 0
    // Высоту снимаем ПРЯМО В DOM, а не только через setState: React коммитит
    // состояние следующим тиком, и замер цели успевал пройти по старой
    // раскладке — трансформ уже применён, а распорка ещё держит место, отсюда
    // промах на её высоту. setSpacerReleased ниже нужен, чтобы React потом не
    // вернул высоту обратно своим рендером
    if (spacer) {
      spacer.style.transition = 'none'
      spacer.style.height = '0px'
    }
    setSpacerReleased(true)
    // Трансформ удержания здесь НЕ ставим: цель нужно мерить по чистой
    // конечной раскладке, иначе клон целится в «поднятую» позицию и едет к ней
    // (в логе — сдвиг таблицы на всю высоту распорки). Удержание включает уже
    // playRelease, первым кадром своей анимации, и всё это происходит в одном
    // тике — браузер рисует сразу конечный кадр, без промежуточного скачка
    return drop
  }

  // Отпускаем удержание: история плавно приходит на своё место.
  // drop — на сколько она УЖЕ сместилась к этому моменту (замер по якорю в
  // flyPanelToChat), знак любой: плюс — уехала вниз, минус — вверх
  function playRelease(drop) {
    const inner = document.querySelector('.playerFeedInner')
    if (!inner) return
    if (Math.abs(drop) < 1) { inner.style.transform = ''; return }
    // Первый кадр анимации сам удержит историю на месте — отдельная
    // предустановка стиля не нужна и только создала бы лишний кадр
    const anim = inner.animate(
      [
        { transform: `scaleY(-1) translateY(${-drop}px)` },
        { transform: 'scaleY(-1) translateY(0px)' },
      ],
      // Мягкий старт обязателен: движение начинается из покоя, а easeOut-кривые
      // срываются с места на полной скорости — первый же кадр давал 17px и
      // читался рывком. cubic-bezier(0.4, 0, 0.2, 1) разгоняется и тормозит
      // плавно. Те же цифры у превращения клона (FLIGHT_MS/SPACER_EASE)
      { duration: 320, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    )
    const clear = () => { inner.style.transform = '' }
    anim.onfinish = clear
    anim.oncancel = clear
  }

  // Ноду можно прогнать заново (шаг назад у админа) — состояние ухода
  // сбрасывается, иначе панель откроется уже «отправленной»
  function reset() {
    setToChat(false)
    setGivenToBubble(null)
    setSpacerReleased(false)
  }

  return { toChat, givenToBubble, spacerReleased, sendToChat, reset }
}
