// Отправка из окна «📤 Отправить» стенда пилюль В GitHUB (владелец, стенд v3.3.275: «чтобы можно было отсюда направлять в GitHub логи»): те же логи, что у кнопок игры и админки —
// комментарий из попапа (SendLogButton) + журнал игры + отладочные строки (logUpload.collectLogs) и ещё ПАКЕТ СТЕНДА (отчёт pithy-stand-pack: темы, отрезок, метки, кадры) отдельным файлом.
// Галочка «Отправить логи» снята — уходит один комментарий; «Дополнить» — не заменять, а копить файлы в ветке logs. Ничего не бросает: строка для человека («Отправлено в GitHub … — напиши мне «читай»»).
import { collectLogs, uploadLogs, fitText } from '../../shared/lib/logUpload.js'

/** build — () => пакет (pillStandReport.buildPack: { name, text }); opts — { withLogs, append } из попапа */
export async function sendStandGit({ comment = '', withLogs = true, append = false, build, collect = collectLogs, upload = uploadLogs } = {}) {
  try {
    const files = await collect({ comment, withLogs })
    if (withLogs && build) {
      try { const p = build(); if (p?.text) files.push({ name: p.name, text: fitText(p.name, p.text) }) } catch { /* пакет не собрался (нет записи) — уйдут просто логи */ }
    }
    return await upload(files, { append })
  } catch (e) { return `Не отправилось: ${e?.message ?? 'ошибка'}` }
}
