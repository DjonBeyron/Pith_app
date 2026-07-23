import { pLog } from '../../../../shared/lib/debug.js'

// Дамп полной конфигурации таблицы-диктора в момент старта аудио.
// Цель: в скачанном логе можно построчно сверить «что настроено в редакторе
// таймлайна» с «что реально видит плеер» — частая причина «авто-монтаж работает плохо».
export function logDictatorConfig({
  answer, cells, timeline, checkAt, checkDelay, duration,
  tokens, extraFromAnswer, distractors, shuffledExtras, hasExtraLayers,
}) {
  pLog('══════════ TABLE DICTATOR · СТАРТ АВТОРЕЖИМА ══════════')
  pLog(`[td-cfg] answer="${answer}"`)
  pLog(`[td-cfg] аудио: duration=${duration != null ? duration.toFixed(2) + 's' : '?'} checkAt=${checkAt != null ? checkAt + 's' : 'нет (сборка после аудио)'} checkDelay=${checkDelay}ms`)
  pLog(`[td-cfg] hasExtraLayers=${hasExtraLayers} (word-слои управляют зелёным по времени)`)

  // 1) Как разобран ответ на токены — порядок, тип каждого слова
  pLog(`[td-cfg] --- разбор ответа на ${tokens.length} токен(ов) (порядок слева-направо) ---`)
  tokens.forEach((tok, i) => {
    pLog(`[td-cfg]   токен#${i} = ${tok.type === 'cell' ? 'ЯЧЕЙКА-в-таблице' : `СЛОВО-ВНЕ-ТАБЛИЦЫ "${tok.value}"`}`)
  })
  pLog(`[td-cfg] слова-вне-таблицы (extraFromAnswer)=[${extraFromAnswer.join(' | ')}]`)
  pLog(`[td-cfg] отвлекающие (distractors)=[${distractors.join(' | ')}]`)
  pLog(`[td-cfg] порядок чипов в плеере (shuffledExtras)=[${shuffledExtras.join(' | ')}]`)

  // 2) Полный дамп слоёв таймлайна с их клипами и временами (in/out)
  const layers = timeline?.layers ?? []
  pLog(`[td-cfg] --- слоёв в таймлайне: ${layers.length} ---`)
  layers.forEach((l, i) => {
    const cell = cells.find(c => c.id === l.cellId)
    const kind = l.isCheck
      ? '✓ПРОВЕРКА (учитывается только начало клипа)'
      : l.word
        ? `СЛОВО-ВНЕ-ТАБЛ "${l.word}"`
        : cell
          ? `ЯЧЕЙКА "${cell.value?.trim() ?? ''}" (id=${l.cellId})`
          : `⚠ОСИРОТЕВШИЙ СЛОЙ cellId=${l.cellId} (ячейка удалена?)`
    const clip = l.clips?.[0]
    const clipStr = clip
      ? `клип [in=${clip.start.toFixed(2)}s → out=${clip.end.toFixed(2)}s] длит=${(clip.end - clip.start).toFixed(2)}s`
      : '⚠НЕТ КЛИПА (не сработает)'
    const vis = l.visible === false ? '🚫СКРЫТ' : '👁видим'
    pLog(`[td-cfg]   слой#${i} ${vis} · ${kind} · ${clipStr}`)
  })

  // 3) Ожидаемая последовательность событий по времени (для сверки с фактом ниже в логе)
  const events = []
  for (const l of layers) {
    if (l.visible === false) continue
    const clip = l.clips?.[0]
    if (!clip) continue
    if (l.isCheck) {
      events.push([clip.start, `ПРОВЕРКА фразы (checkAt=${clip.start.toFixed(2)}s, +${checkDelay}ms задержка)`])
    } else if (l.word) {
      events.push([clip.start, `подсветить слово-вне-табл "${l.word}"`])
      events.push([clip.end,   `погасить слово-вне-табл "${l.word}"`])
    } else {
      const cell = cells.find(c => c.id === l.cellId)
      const v = cell?.value?.trim() ?? `id=${l.cellId}`
      events.push([clip.start, `подсветить ячейку "${v}" → через ~0.3с в бокс`])
      events.push([clip.end,   `погасить ячейку "${v}"`])
    }
  }
  events.sort((a, b) => a[0] - b[0])
  pLog(`[td-cfg] --- ОЖИДАЕМАЯ последовательность по времени аудио ---`)
  events.forEach(([t, what]) => pLog(`[td-cfg]   ${t.toFixed(2).padStart(6)}s → ${what}`))
  pLog('═══════════════════════════════════════════════════════')
}

// Дебаг разрешения файла: file_id из ноды vs то, что реально пришло в проп `file`
// (blobUrl из прелоада / r2Url напрямую / ничего) — чтобы видеть, ПОЧЕМУ аудио не
// проигрывается: файл не найден в files[], не докачался (blobUrl/r2Url пустые).
export function logFileResolution(fileIdCfg, file, blobUrl) {
  pLog(`[td-file] file_id(нода)=${fileIdCfg ?? '—'} file=${file ? 'найден' : '⚠ НЕ НАЙДЕН в files[]'} `
    + `blobUrl=${file?.blobUrl ?? '—'} r2Url=${file?.r2Url ?? '—'} error=${file?.error ?? false} → итог src=${blobUrl ?? '⚠ NULL (аудио не смонтируется)'}`)
}

export function logAudioPlayRejected(e, blobUrl) {
  pLog(`[td-file] ⚠ audio.play() отклонён: ${e?.name ?? '?'} "${e?.message ?? e}" src=${blobUrl}`)
}

export function logAudioError(mediaError, src) {
  pLog(`[td-file] ⚠ <audio> onError code=${mediaError?.code ?? '?'} src=${src} `
    + `(1=ABORTED 2=NETWORK 3=DECODE 4=SRC_NOT_SUPPORTED)`)
}

// Диагностика мини-спектра (HUD над таблицей): «куда пропал».
// hudEl — контейнер .tdHud. Проверяем: смонтирован ли, есть ли waveformData,
// реальные размеры, и НЕ ОБРЕЗАЕТ ли его сверху overflow:hidden у .tdStage.
export function logHudState(hudEl, { waveformData }) {
  if (!hudEl) {
    pLog('[td-hud] ⚠ HUD НЕ смонтирован (barElsRef пуст) — спектра нет в DOM')
    return
  }
  const r  = hudEl.getBoundingClientRect()
  const cs = getComputedStyle(hudEl)
  pLog(`[td-hud] waveformData=${waveformData?.length ?? 0} точек; display=${cs.display} opacity=${cs.opacity} transform="${cs.transform}"`)
  pLog(`[td-hud] HUD rect: top=${r.top.toFixed(0)} left=${r.left.toFixed(0)} w=${r.width.toFixed(0)} h=${r.height.toFixed(0)} (w=0/h=0 → не отрисован)`)

  // HUD теперь ВНЕ .tdStage (фикс обрезки). Если внутри — значит регресс.
  const stage = hudEl.closest('.tdStage')
  if (stage) {
    const sr = stage.getBoundingClientRect()
    const ov = getComputedStyle(stage).overflow
    const clippedTop = r.top < sr.top
    pLog(`[td-hud] ⚠ РЕГРЕСС: HUD снова внутри .tdStage (overflow=${ov}); ОБРЕЗАН СВЕРХУ=${clippedTop}`)
  } else {
    const visible = r.width > 0 && r.height > 0
    pLog(`[td-hud] HUD вне .tdStage (не режется). Видим=${visible}`)
  }
}
