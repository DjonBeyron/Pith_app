import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const dir = dirname(fileURLToPath(import.meta.url))
// CRLF → LF: в рабочей копии файлы бывают и CRLF (autocrlf), и LF — сторожа
// многострочных кусков не должны зависеть от этого
const read = p => readFileSync(join(dir, p), 'utf8').replace(/\r\n/g, '\n')

// Все 4 гарантии из задачи проверяются по исходникам (source-inspection),
// как и остальные тесты плеера в этом проекте — плеер целиком не рендерится
// (нет @testing-library/react), но конкретные инварианты кода можно закрепить
// строкой в файле: сторож не даст случайно выпилить их будущей правкой.

describe('«Продолжить урок» — XP не теряется и не задваивается', () => {
  const progressApi = read('../../shared/lib/lessonProgressApi.js')
  const resumeHook   = read('./useLessonResume.js')
  const player       = read('./LessonPlayer.jsx')
  const graphPlayer  = read('./useGraphPlayer.js')

  // 1) Заработанный, но не начисленный XP не теряется на «Продолжить урок»
  it('чекпойнт хранит XP, накопленный к моменту сохранения', () => {
    expect(progressApi).toContain('export async function saveLessonProgress(lessonId, nodeId, pct = 0, xp = 0, visitedIds = [])')
    // Гостю (localStorage) — реально нужен: сервер за него не считает
    expect(progressApi).toMatch(/localStorage\.setItem\(LS_PREFIX \+ lessonId, JSON\.stringify\(\{ nodeId, pct, xp, visitedIds,/)
  })

  it('LessonPlayer передаёт earnedXpRef.current и историю нод в каждый чекпойнт', () => {
    expect(player).toContain('onCheckpoint: (nodeId, vIds) => resumeState.checkpoint(')
    expect(player).toContain('earnedXpRef.current, vIds)')
  })

  it('resume() отдаёт сохранённый XP наверх колбэком onResume', () => {
    expect(resumeHook).toContain('if (resumeOffer.xp > 0) onResume?.(resumeOffer.xp)')
  })

  it('LessonPlayer засевает earnedXpRef/earnedXp из onResume', () => {
    const block = player.slice(player.indexOf('useLessonResume(lessonId, edit'), player.indexOf('const holdForResume'))
    expect(block).toContain('earnedXpRef.current = xp')
    expect(block).toContain('setEarnedXp(xp)')
  })

  // 2) XP не начисляется дважды за одно прохождение
  it('финиш урока (onFinish) срабатывает ровно один раз за сессию', () => {
    expect(graphPlayer).toContain('const finishedRef = useRef(false)')
    expect(graphPlayer).toContain('if (finishedRef.current) return')
    expect(graphPlayer).toContain('finishedRef.current = true')
  })

  // 3) XP начисляется ТОЛЬКО при полном завершении урока — не по ходу ответов
  it('onXpEarned копит счётчик в памяти, но НЕ пишет его на сервер/локально', () => {
    const fn = player.slice(player.indexOf('function handleXpEarned'), player.indexOf('function dismissXpEvent'))
    expect(fn).toContain('setEarnedXp(prev =>')
    expect(fn).not.toContain('addLocalXp')
    expect(fn).not.toContain('completeLesson')
  })

  it('запись начисления живёт только в useLessonFinish — по одному вызову на весь урок', () => {
    const finish = read('./useLessonFinish.js')
    expect(finish).toContain('const awarded = lessonId ? await completeLesson(lessonId) : 0')
    expect(finish).toContain('if (earned > 0) addLocalXp(earned)')
  })

  // 4) Повторное прохождение уже пройденного урока — без нового начисления
  it('уже пройденный урок не предлагает «Продолжить» — повтор всегда с начала', () => {
    expect(resumeHook).toContain('!getCompletedLessons().has(lessonId)')
  })

  it('серверная идемпотентность не зависит от клиента: xp_awarded/уникальный индекс', () => {
    // Источник правды о схеме — baseline-миграция (см. CLAUDE.md), не архивный
    // supabase_schema.sql
    const baseline = read('../../../supabase/migrations/20260717120000_baseline.sql')
    expect(baseline).toContain('lesson_results_user_lesson_uniq')
    expect(baseline).toMatch(/where lesson_results\.xp_awarded = false/i)
  })
})

// 5) История чата выше точки входа при «Продолжить урок» — раньше лента
// стартовала пустой, теперь чекпойнт несёт полный список показанных id
// (visitedIds), из него восстанавливается history-хвост
describe('«Продолжить урок» — история чата восстанавливается', () => {
  const progressApi = read('../../shared/lib/lessonProgressApi.js')
  const resumeHook  = read('./useLessonResume.js')
  const graphPlayer = read('./useGraphPlayer.js')
  const migration   = read('../../../supabase/migrations/20260919090000_lesson_progress_visited_ids.sql')

  it('миграция добавляет visited_ids идемпотентно (if not exists)', () => {
    expect(migration).toMatch(/add column if not exists visited_ids jsonb/)
  })

  it('чекпойнт хранит и читает полный список показанных id', () => {
    expect(progressApi).toContain(".select('node_id, pct, updated_at, visited_ids')")
    expect(progressApi).toContain('visitedIds: data.visited_ids ?? []')
  })

  it('useGraphPlayer строит объекты истории по id и метит их isHistory', () => {
    expect(graphPlayer).toContain('const historyNodes = (historyIds ?? []).map(id => nodeMapRef.current[id]).filter(Boolean)')
    expect(graphPlayer).toContain('.map(n => ({ ...n, isHistory: true }))')
  })

  it('изначально показывается не вся история сразу, а последняя страница', () => {
    expect(graphPlayer).toContain('const HISTORY_PAGE = 8')
    expect(graphPlayer).toContain('historyNodes.slice(-HISTORY_PAGE)')
    expect(graphPlayer).toContain('const requestMoreHistory = useCallback')
  })

  it('resume() режет entry-ноду из истории — она не дублируется как historical', () => {
    expect(resumeHook).toContain('const before = resumeOffer.visitedIds.slice(0, -1)')
  })

  it('isHistory — снимок в ленте, не часть самой ноды (иначе терялся бы при freshVisible)', () => {
    expect(graphPlayer).toContain('visit: n.visit, isHistory: n.isHistory')
  })
})

// 6) Автоплей/анимации/звук/салют не должны повторяться на восстановленной
// истории — иначе «Продолжить урок» превращалось бы в хор видео и салютов
describe('«Продолжить урок» — восстановленная история не переигрывает автозапуск', () => {
  const video   = read('./modules/video/VideoModule.jsx')
  const circle  = read('./modules/circle/CircleModule.jsx')
  const rotate  = read('./modules/rotate-phone/RotatePhoneModule.jsx')
  const reaction = read('./modules/reaction/ReactionModule.jsx')
  const pin     = read('./modules/pin-message/PinMessageModule.jsx')
  const wordChoice = read('./modules/word-choice/WordChoiceModule.jsx')
  const phraseAssembly = read('./modules/phrase-assembly/PhraseAssemblyModule.jsx')
  const fillBlanks = read('./modules/fill-blanks/FillBlanksModule.jsx')

  it('видео/кружок не автозапускаются на истории', () => {
    expect(video).toContain('autoPlay={!videoAutoSound && !node.isHistory}')
    expect(video).toContain('firstPlayDoneRef.current || node.isHistory) return')
    expect(circle).toContain('autoPlay={!videoAutoSound && !node.isHistory}')
    expect(circle).toContain('firstPlayDoneRef.current || node.isHistory) return')
  })

  it('«переверни телефон» не запускает тренажёр заново на истории', () => {
    expect(rotate).toContain('if (canRotate || node.isHistory) return')
  })

  it('реакция сразу в конечном виде, без анимации и искр на истории', () => {
    expect(reaction).toContain('if (node.isHistory) return')
  })

  it('закреплённое сообщение не звучит заново на истории', () => {
    expect(pin).toContain('node?.isHistory')
  })

  it('салют не повторяется на исторически верных ответах', () => {
    // У «выбери слово» салют живёт в панели (ChooseWordPanel), а панели у
    // восстановленной истории нет вовсе — чат-модуль салюта не знает
    expect(wordChoice).not.toContain('BurstConfetti')
    // «Собери фразу»: салют тоже в панели (PhraseAssemblyPanel), чат-модуль без него
    expect(phraseAssembly).toContain('confetti={false}')
    // «Составь предложение»: салют тоже в панели (FillBlanksPanel), чат-модуль без него
    expect(fillBlanks).toContain('confetti={false}')
  })
})

// 7) Пользователь увидел «скачок» при появлении восстановленной истории —
// причина: PlayerFeed.jsx считал 8+ разом появившихся строк «новыми
// сообщениями» и слал каждую в анимацию въезда + отдельный звук почти хором
describe('«Продолжить урок» — история появляется без «скачка» въезда/звука', () => {
  const feedNodes = read('./PlayerFeedNodes.jsx')

  it('исторические строки помечены data-no-slide — тем же приёмом, что у превращения таблицы', () => {
    expect(feedNodes).toContain("data-no-slide={node.isHistory ? 'true' : undefined}")
  })
})

// 8) Решение «Продолжить/Начать заново» перенесено в карточку запуска — не
// делаем двойную работу (обычный старт → отдельный попап ВНУТРИ плеера),
// и прогрев (usePlayerPreload) с самого начала целится в нужную точку
describe('«Продолжить урок» — решение и прогрев в карточке запуска, не внутри плеера', () => {
  const launch   = read('../../features/lessons/LessonLaunchCard.jsx')
  const choice   = read('../../features/lessons/LaunchCtaSlot.jsx')
  const standalone = read('../../features/lessons/StandaloneLessonRunner.jsx')
  const curriculum = read('../../features/lessons/CurriculumView.jsx')
  const race        = read('../../features/race/RaceRunner.jsx')
  const player       = read('./LessonPlayer.jsx')
  const resumeHook  = read('./useLessonResume.js')

  it('чекпойнт читается ПАРАЛЛЕЛЬНО с загрузкой сценария, до прогрева', () => {
    expect(launch).toContain("import { getLessonProgress, clearLessonProgress } from '../../shared/lib/lessonProgressApi.js'")
    expect(launch).toContain('if (!skipResumeCheck) {')
    expect(launch).toContain('getLessonProgress(lessonId)')
  })

  it('пересдача/уже пройденный/гонка — «Продолжить» не предлагается', () => {
    expect(launch).toContain('const skipResumeCheck = !allowResume || retake || getCompletedLessons().has(lessonId)')
    expect(race).toContain('allowResume={false}')
  })

  it('mayResume определён один раз и переиспользуется в ширине/каркасе/прогреве — не пересчитывается по месту', () => {
    expect(launch).toContain('const mayResume = !skipResumeCheck')
    expect(launch).toContain('mayResume={mayResume}')
    expect(launch).not.toContain('!skipResumeCheck}')
  })

  it('прогрев целится в точку возобновления, если она есть — не всегда в начало', () => {
    expect(launch).toContain('const resumeEntryNode = resumeOffer?.nodeId ? nodes.find(n => n.id === resumeOffer.nodeId) : null')
    expect(launch).toContain('nodes, files, resumeEntryNode ? [resumeEntryNode] : [], { initialLookahead: WARMUP_TARGET, bufferSize }')
  })

  it('LaunchCtaSlot — брендовая кнопка «Продолжить», рендерится вместо «Начать урок»', () => {
    expect(launch).toContain('{resumeOffer ? (')
    expect(launch).toContain('<LaunchCtaSlot')
    expect(launch).toContain('primaryClassName="resumeLessonBtnPrimary"')
    expect(choice).toContain('className={primaryClassName}')
  })

  it('payload несёт точку входа/историю/XP только когда реально жмут «Продолжить»', () => {
    expect(launch).toContain("startNodeId: resume ? resumeOffer.nodeId : null")
    expect(launch).toContain('historyIds:  resume ? (resumeOffer.visitedIds ?? []).slice(0, -1) : null')
    expect(launch).toContain('resumedXp:   resume ? (resumeOffer.xp ?? 0) : 0')
  })

  it('«Начать заново» стирает чекпойнт ДО старта — плеер не найдёт его повторно', () => {
    expect(launch).toContain('onRestartProgress={() => { clearLessonProgress(lessonId); setResumeOffer(null) }}')
    expect(launch).toContain('onGhost={() => { onRestartProgress(); handleStart() }}')
  })

  it('оба запуска (модуль и отдельный урок) прокидывают startNodeId/historyIds/resumedXp в плеер', () => {
    expect(standalone).toContain('startNodeId={playerData.startNodeId ?? null}')
    expect(standalone).toContain('historyIds={playerData.historyIds ?? null}')
    expect(standalone).toContain('resumedXp={playerData.resumedXp ?? 0}')
    expect(curriculum).toContain('startNodeId={playerData.startNodeId ?? null}')
    expect(curriculum).toContain('resumedXp={playerData.resumedXp ?? 0}')
  })

  it('плеер сеет earnedXp из resumedXp и пропускает СВОЮ проверку, если точка входа уже решена картой запуска', () => {
    expect(player).toContain('const earnedXpRef = useRef(resumedXp)')
    expect(player).toContain('useState(resumedXp)')
    expect(player).toContain('!!startNodeId)')
    expect(resumeHook).toContain('export function useLessonResume(lessonId, edit, onResume, skipCheck = false)')
    expect(resumeHook).toContain('active && !skipCheck && !getCompletedLessons().has(lessonId)')
  })
})

// 9) Карточка запуска не должна сама «скакать» — сперва узкая с кнопкой
// «Начать урок», через мгновение шире с «Продолжить» (чекпойнт читается
// асинхронно и мог прийти позже сценария). Ждём оба результата разом
describe('карточка запуска — без собственного «скачка» на чекпойнте', () => {
  const launch = read('../../features/lessons/LessonLaunchCard.jsx')

  it('содержимое показывается только когда решены сценарий, чекпойнт И прошёл минимум 1.2с', () => {
    expect(launch).toContain('const ready = !!lessonData && resumeOffer !== undefined && minTimeElapsed')
    expect(launch).toContain('{!error && !ready && <LaunchSkeleton')
  })

  it('предзагрузка стартует сразу по готовности сценария — LaunchPreloader монтируется, не ждёт ready', () => {
    // Монтируется рано (usePlayerPreload не теряет впустую 1.2с задержки),
    // но визуально скрыт (display:none) до ready — виден только итог, без
    // роста/мигания промежуточных состояний
    expect(launch).toContain("{lessonData && (\n          <div style={{ display: ready ? 'contents' : 'none' }}>")
    expect(launch).toContain('setMinTimeElapsed(true), 1200')
  })

  it('ширина карточки решена ДО показа содержимого — mayResume, не ready && resumeOffer', () => {
    // Раньше ширина зависела от ready && resumeOffer — момента, когда
    // содержимое УЖЕ показано: каркас всегда рисовался узким (420), и при
    // найденном чекпойнте карточка скакала на 460 ровно в момент раскрытия.
    // mayResume известен синхронно, до сети — и каркас, и содержимое сразу
    // используют одну ширину, скакать нечему
    expect(launch).toContain('maxWidth: mayResume ? 460 : 420')
    expect(launch).not.toContain('maxWidth: ready && resumeOffer')
  })

  it('высота нижнего блока совпадает по КОНСТРУКЦИИ, не по числу-догадке — LaunchCtaSlot и в каркасе, и в содержимом', () => {
    const skeleton = read('../lessons/LaunchSkeleton.jsx')
    const ctaSlot  = read('../lessons/LaunchCtaSlot.jsx')
    // Каркас узнаёт заранее (синхронно, без сети), стоит ли резервировать
    // место под вторую кнопку — та же проверка, что решает финальный исход
    expect(launch).toContain('<LaunchSkeleton title={lessonTitle} info={info} mayResume={mayResume} />')
    expect(skeleton).toContain('export default function LaunchSkeleton({ title, info, mayResume = false }) {')
    expect(skeleton).toContain('{mayResume ? (\n        <LaunchCtaSlot')
    // И обычная кнопка «Начать урок» (когда чекпойнт ещё не решён, но теоретически
    // возможен), и «Продолжить» — LaunchCtaSlot с одними и теми же CSS-классами
    expect(launch).toContain(') : mayResume ? (\n        <LaunchCtaSlot')
    expect(launch).toContain('showSecondRow')
    // Второй ряд скрыт через visibility (не display:none) — место остаётся занятым
    expect(ctaSlot).toContain("visibility: showSecondRow ? 'visible' : 'hidden'")
  })

  // Найдено на реальном рендере (не строкой): одинаковый DOM ещё не значит
  // одинаковую высоту — пустая строка в скрытом <span> даёт высоту 0 (нет
  // текста — нет строки), а длинный реальный текст «В прошлый раз ты дошёл
  // примерно до X%» переносится на 2 строки там, где короткая заглушка
  // каркаса помещается в одну. Оба расхождения ловились только через
  // getBoundingClientRect в браузере, не через сравнение исходников
  it('pctLabel никогда не пуст (обе LaunchCtaSlot в LessonLaunchCard.jsx) и не переносится на 2 строки', () => {
    const skeleton = read('../lessons/LaunchSkeleton.jsx')
    const ctaSlot  = read('../lessons/LaunchCtaSlot.jsx')
    expect(skeleton).toContain('pctLabel="Загрузка..."')
    expect(launch).toContain('pctLabel="Загрузка..."')
    expect(launch).toContain('pctLabel={`Дошёл примерно до ${Math.round(resumeOffer.pct ?? 0)}%`}')
    expect(ctaSlot).toContain("whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'")
  })

  // nowrap (выше) убирает разницу в высоте, но на узкой карточке (мобильный
  // экран, ~270px внутри) длинную фразу физически обрезает многоточием —
  // пользователь увидел это на реальном устройстве. «В прошлый раз ты дошёл
  // примерно до 100%» — до 270px по ширине, впритык к самому узкому content
  // width карточки; «Дошёл примерно до 100%» — 159px, запас почти вдвое
  it('текст о прошлом прогрессе короткий — не обрезается многоточием даже на самой узкой карточке', () => {
    expect(launch).not.toContain('В прошлый раз ты дошёл')
  })

  // 3.2.1728: второе «Загрузка...» (в каркасе — по центру блока, в содержимом —
  // в слоте кнопки, другим шрифтом, чем «Загрузка урока: N%») читалось как
  // отдельный элемент. Загрузку показывают только полоса и строка с процентом;
  // место под кнопки держится невидимым, кнопка проявляется, когда урок готов
  it('в каркасе и в содержимом нет второго видимого «Загрузка...» под полосой', () => {
    const skeleton = read('../lessons/LaunchSkeleton.jsx')
    expect(skeleton).toContain("primaryStyle={{ padding: '14px 0', borderRadius: 12, border: 'none', fontSize: 16, visibility: 'hidden' }}")
    expect(skeleton).toContain("fontSize: 16, fontWeight: 600, visibility: 'hidden',")
    expect(skeleton).not.toContain("position: 'absolute', inset: 0,")
    expect(launch).toContain('opacity: canStart ? 1 : 0,')
    expect(launch).toContain("cursor: 'default', opacity: 0 }}")
  })
})

// 10) После «Продолжить» лента не должна на мгновение показаться пустой —
// заполнение visibleNodes должно случиться ДО первого кадра браузера
describe('«Продолжить урок» — лента без пустого первого кадра', () => {
  const graphPlayer = read('./useGraphPlayer.js')

  it('заполнение ленты — useLayoutEffect, не useEffect', () => {
    expect(graphPlayer).toContain("import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'")
    expect(graphPlayer).toMatch(/useLayoutEffect\(\(\) => \{\s*\n\s*if \(!nodes\.length\)/)
  })
})
