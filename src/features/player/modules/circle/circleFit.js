// Геометрия кадра в кружке — ОДНА функция и для живого видео, и для стоп-кадра
// (постера): одна и та же матрица, поэтому при смене «стоп-кадр → видео»
// картинка не прыгает.
//
// box — размер рамки кружка (px), mediaW/mediaH — размер кадра (у видео
// videoWidth/Height, у постера — naturalWidth/Height: постер снят в размере
// кадра видео), crop — {x, y, scale} ноды (задаётся в редакторе, NodeMediaCrop).
//
// Известны оба размера — медиа в точный cover-размер по центру рамки + сдвиг и
// масштаб. Неизвестны (ещё нет метаданных / постер не загружен) — запасной
// путь width/height 100% + object-fit: cover, геометрически тот же результат
// для рамки-квадрата. Раньше запасной путь был без width/height: у
// замещаемого элемента (<img>, <video>) inset:0 не растягивает, и он рисовался
// в натуральном размере кадра — отсюда «сильно увеличено» до loadedmetadata.
export function circleFit({ box, mediaW, mediaH, crop }) {
  const c = crop ?? { x: 0, y: 0, scale: 1 }
  if (!box?.w || !box?.h || !mediaW || !mediaH) {
    return {
      position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover',
      transform: `translate(${c.x}px,${c.y}px) scale(${c.scale})`,
      transformOrigin: 'center center',
    }
  }
  const ma = mediaW / mediaH, fa = box.w / box.h
  const d = ma > fa ? { w: box.h * ma, h: box.h } : { w: box.w, h: box.w / ma }
  return {
    position: 'absolute', left: '50%', top: '50%',
    width: d.w + 'px', height: d.h + 'px',
    transform: `translate(calc(-50% + ${c.x}px), calc(-50% + ${c.y}px)) scale(${c.scale})`,
    transformOrigin: 'center center',
  }
}
