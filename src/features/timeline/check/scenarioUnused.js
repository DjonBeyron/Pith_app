// Реплики каталога «Встряхни память», которые в сегодняшней игре НЕ ЗВУЧАТ, — с причиной простыми словами. Сценарий (scenarioBuild.js) считает «не звучащей» любую реплику каталога, которой нет ни в одном его блоке;
// причина берётся отсюда. Сторож scenarioBuild.test.js: у каждой не звучащей реплики причина есть, и ни одна реплика из этого списка в сценарий не попала (попала — значит, игра изменилась: убрать её отсюда).
const CLIMB = 'этапы «Вершина» и «Спуск» в игру не входят (играется «Пинг-понг + фразы + финал»)'
const SPARE = 'запас: отдельное объявление круга заменила стартовая реплика'
export const UNUSED_WHY = {
  race_sprint: SPARE, race_sprint_tap: SPARE,
  race_climb: CLIMB, race_climb_slip: CLIMB, race_climb_top: CLIMB, race_climb_time: CLIMB, race_descent: CLIMB,
  race_trap_pre: CLIMB, race_trap_mid: CLIMB, race_trap_short: CLIMB,
  race_ask_voice: 'только стенд: вопрос «голосом или руками» перед стартом',
  boss_mia_ru_wait: 'звучит только на медленном телефоне, пока русская модель слуха ещё грузится (прикрытие за «Я меняю правила», boss/useSwitchWait.js)',
}
