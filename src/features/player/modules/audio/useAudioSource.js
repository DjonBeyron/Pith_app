import { useCallback, useEffect, useState } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Откуда голосовое берёт звук — и почему этот адрес нельзя менять на лету.
//
// Предзагрузчик держит файлы блобами и по мере продвижения по уроку освобождает
// самые давние. Когда blob давнего голосового освобождался, адрес сам собой
// менялся на прямую ссылку на ТОТ ЖЕ файл — и это перезапускало всё: элемент
// перезагружался, расшифровка сбрасывалась и появлялась снова, а пузырь начинал
// гонять высоту туда-сюда и двигал вместе с собой всю переписку. В логе с
// iPhone так продолжалось 18 секунд подряд.
//
// Поэтому: как только звук загрузился в элемент, адрес фиксируется. Подмена
// blob → ссылка после этого не значит ничего — данные уже в памяти.
// Отпускаем фиксацию только если воспроизвести действительно не получилось
// (unlock): тогда пересчёт возьмёт то, что доступно сейчас.
export function useAudioSource(node, file) {
  const [objectUrl, setObjectUrl] = useState(null)
  const [loadedSrc, setLoadedSrc] = useState(null)

  useEffect(() => {
    // Синхронный setState осознан: blob-URL живёт строго вместе с file.localFile
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!file?.localFile) { setObjectUrl(null); return }
    const url = URL.createObjectURL(file.localFile)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file?.localFile])

  const rawSrc = objectUrl ?? file?.blobUrl ?? file?.r2Url ?? node.typeData?.audio?.r2Url ?? null
  const src = loadedSrc ?? rawSrc

  // Видно в логе, что подмена случилась и что мы её пережили без перезагрузки:
  // раньше именно здесь чат и начинал дёргаться
  useEffect(() => {
    if (loadedSrc && rawSrc && rawSrc !== loadedSrc) {
      pLog('AudioModule: источник подменён (blob освобождён) — держим загруженный, звук и текст не трогаем')
    }
  }, [rawSrc, loadedSrc])

  // Обе стабильны (пустые deps): иначе подписка на события элемента в
  // AudioModule пересобиралась бы на каждый рендер. Адрес приходит аргументом
  // — у вызывающего он и так в зависимостях эффекта
  const lock   = useCallback(v => setLoadedSrc(v), [])
  const unlock = useCallback(() => setLoadedSrc(null), [])

  return { src, locked: !!loadedSrc, lock, unlock }
}
