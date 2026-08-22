// Браузерные надстройки над видео («перевести», «в отдельном окне», «скачать»,
// AirPlay) — Яндекс.Браузер и Chrome рисуют их поверх <video> при наведении.
// В уроке это чужой интерфейс поверх сообщения, поэтому глушим всем, чем
// можно со стороны страницы:
//   controls        — своих контролов у нас нет и быть не должно
//   controlsList    — запрет пунктов, если браузер всё же нарисует меню
//   disablePictureInPicture / disableRemotePlayback / x-webkit-airplay —
//                     убирают кнопки «в отдельном окне» и трансляции
// Плюс само <video> не должно быть целью указателя: клики ловит обёртка
// (см. VIDEO_GUARD_STYLE), иначе браузер считает, что курсор «на видео».
export const VIDEO_GUARD = {
  controls: false,
  controlsList: 'nodownload noplaybackrate nofullscreen noremoteplayback',
  disablePictureInPicture: true,
  disableRemotePlayback: true,
  'x-webkit-airplay': 'deny',
}

export const VIDEO_GUARD_STYLE = { pointerEvents: 'none' }

// Для <video>, созданных вручную (пул ленты): те же атрибуты через DOM
export function applyVideoGuard(el) {
  if (!el) return el
  el.controls = false
  el.setAttribute('controlslist', VIDEO_GUARD.controlsList)
  el.disablePictureInPicture = true
  el.disableRemotePlayback = true
  el.setAttribute('x-webkit-airplay', 'deny')
  return el
}
