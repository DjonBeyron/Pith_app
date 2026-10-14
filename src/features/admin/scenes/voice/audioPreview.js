// Один <audio> на окно сборщика для «Прослушать» (реплика по audioUrl, тестовая фраза
// голоса по blob). Новый запуск останавливает предыдущий; blob-адреса освобождаются.
// Фабрика без React — хук useSceneVoice держит экземпляр в ref.

export function createPreviewPlayer(make = () => new Audio()) {
  let audio = null
  let blobUrl = null
  let onState = () => {}

  const stop = () => {
    if (!audio) return
    try { audio.pause() } catch { /* ignore */ }
    audio.onended = audio.onerror = null
    audio.removeAttribute?.('src')
    if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null }
    onState({ playing: null })
  }

  // src — строка-адрес либо Blob/File; key — что сейчас играет (индекс реплики, 'voice-a'…)
  const play = async (src, key) => {
    stop()
    audio = audio ?? make()
    if (typeof src !== 'string') { blobUrl = URL.createObjectURL(src); src = blobUrl }
    audio.src = src
    audio.onended = () => stop()
    audio.onerror = () => stop()
    onState({ playing: key })
    try { await audio.play() } catch { stop(); throw new Error('браузер не дал воспроизвести звук') }
  }

  return {
    play, stop,
    subscribe: fn => { onState = fn },
    destroy: () => { stop(); audio = null },
  }
}
