// Единый переиспользуемый <video> для всей ленты («Рекомендации» и «Мои
// уроки» показывают по одному видео за раз, поэтому элемент нужен ровно один).
//
// Зачем singleton, а не <video> на каждый слайд (как было раньше):
// браузер (и Safari, и Chrome) разблокирует автозвук не для страницы, а для
// КОНКРЕТНОГО media-элемента — того, что впервые проиграл по жесту юзера. При
// пересоздании <video> на каждый слайд разблокировка терялась: через пару
// видео активным становился свежий, «неблагословлённый» элемент, его play()
// со звуком отклонялся и видео глохло. Один живущий элемент, который мы
// перемещаем в активный слайд и которому меняем src, сохраняет разблокировку
// навсегда — звук не гаснет. Заодно исчезает дёрганье от постоянного
// создания/уничтожения video-узлов при быстром скролле.

let video = null
let holder = null

export function getSharedVideo() {
  if (!video) {
    video = document.createElement('video')
    video.className = 'feedMedia sharedVideo'
    video.loop = true
    video.preload = 'auto'
    video.muted = true
    video.setAttribute('playsinline', '') // iOS: не открывать нативный плеер
    video.playsInline = true
  }
  return video
}

// «Парковка»: скрытый контейнер вне слайдов. Когда активного видео нет или
// слайд размонтируется виртуализатором — элемент переезжает сюда, а не
// уничтожается вместе со слайдом (иначе потеряли бы разблокировку звука).
export function parkSharedVideo() {
  if (!video) return
  if (!holder) {
    holder = document.createElement('div')
    holder.style.cssText =
      'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden'
    document.body.appendChild(holder)
  }
  video.pause()
  if (video.parentElement !== holder) holder.appendChild(video)
}
