// Формат записи дубля («Дубль и зеркало»). По журналу iPhone (iOS 18): MediaRecorder без указания формата писал audio/webm;codecs=opus, а <audio> этот файл не играл
// (play-result ok=false, NotSupportedError, readyState 0) — «Сравнить» молчало. Берём первый формат, который И пишет MediaRecorder (isTypeSupported), И играет <audio> (canPlayType не пустой):
// на iPhone это mp4/AAC, в Chrome — mp4 или webm. Ни один не играет — пишем первый, который пишется, а играет зеркало уже буфером Web Audio (mirror/takeBuffer.js).
export const TAKE_MIMES = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm']

const audioCanPlay = type => { try { return document.createElement('audio').canPlayType(type) || '' } catch { return '' } }

/** → { mimeType (строка или null — формат по умолчанию), why (почему так, для журнала rec-start) } */
export function pickTakeMime({ Recorder, canPlayType = audioCanPlay } = {}) {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return { mimeType: null, why: 'MediaRecorder.isTypeSupported нет: формат по умолчанию' }
  const writable = TAKE_MIMES.filter(t => { try { return Recorder.isTypeSupported(t) } catch { return false } })
  const can = t => { try { return canPlayType(t) || '' } catch { return '' } }
  const both = writable.find(t => can(t))
  if (both) return { mimeType: both, why: `пишется и играет в <audio> (canPlayType: ${can(both)})` }
  if (writable.length) return { mimeType: writable[0], why: '<audio> не играет ни один из пишущихся форматов: играем буфером Web Audio' }
  return { mimeType: null, why: 'ни один формат списка не пишется: формат по умолчанию' }
}
