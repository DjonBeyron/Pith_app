// «Подтолкнуть» слой активного видео после свайпа — только Android.
//
// Жалоба (3.2.1710, часть Android-устройств): после свайпа новое видео
// выглядит с другим оттенком, «будто дымка», чем стартовое, — а как только
// коснёшься экрана, дымка пропадает. Android Chrome выводит неподвижное видео
// аппаратным оверлеем (цвета верные), а видео, которое проявилось, пока его
// слой ехал анимацией Swiper, остаётся на обычной GPU-композиции — на части
// GPU цветовой диапазон видео там декодируется иначе, картинка блёклая.
// Стартовое видео проявляется, когда ничего не движется, — поэтому оно
// яркое. Касание меняет атрибут ленты (data-scrolling), Chrome пересобирает
// слои и заново решает про оверлей — дымка уходит. Делаем то же самое сами:
// на пару кадров отдельный слой видео (невидимый translateZ(0)) и обратно.
//
// Точно воспроизвести без такого телефона нельзя; iOS не трогаем — там этого
// нет, а лишние изменения слоя видео на iOS уже вызывали стоп-кадры

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

export function nudgeVideoLayer(v) {
  if (!isAndroid || !v || !v.isConnected) return false
  // Проявление уже закончилось — висящий transition на видео больше не нужен
  if (v.style.opacity === '1') v.style.transition = ''
  v.style.transform = 'translateZ(0)'
  requestAnimationFrame(() => requestAnimationFrame(() => { v.style.transform = '' }))
  return true
}

// Активное видео ленты: подталкиваем, когда слайд доехал и видео уже
// проявилось. Проявление ждёт пару кадров + фейд 140мс, а по страховке —
// до 500мс, поэтому два раза: сразу после проявления и после страховки
export function nudgeActiveFeedVideo(root, onNudge) {
  if (!isAndroid) return () => {}
  const timers = [250, 700].map(ms => setTimeout(() => {
    const v = root?.querySelector('.feedSlideWrapActive video')
    if (v && !v.paused && nudgeVideoLayer(v)) onNudge?.()
  }, ms))
  return () => timers.forEach(clearTimeout)
}
