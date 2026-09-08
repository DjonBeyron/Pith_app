import AutoLessonPreview from './AutoLessonPreview.jsx'

// Слайд «Моих уроков» (режим ленты) для урока-закладки — без модуля вокруг,
// без реального видео/постера, поэтому вместо SlideVideo — авто-сгенерированное
// превью (AutoLessonPreview.jsx). Прогресс/кнопка — тот же паттерн, что у
// обычного модуля (MyLessonSlide.jsx), но без HUD: лайк/сложность — это про
// модуль из ленты, у отдельного урока такой социальной части нет.
export default function MyLessonRefSlide({ lesson, onOpen }) {
  return (
    <section className="feedSlide">
      <AutoLessonPreview title={lesson.title} />
      <button className="feedLearnBtn mlContinueBtn" onClick={onOpen}>
        {lesson.pct === 100 ? 'Повторить урок' : lesson.paused ? 'Продолжить' : 'Начать урок'}
      </button>
      <div className="mlProgress">
        <div className="mlProgressLabel">
          <span>{lesson.pct === 100 ? 'Урок пройден' : lesson.paused ? 'На паузе' : 'Урок из закладок'}</span>
          <b>{lesson.pct}%</b>
        </div>
        <div className="mlTrack"><div className="mlFill" style={{ width: `${lesson.pct}%` }} /></div>
      </div>
    </section>
  )
}
