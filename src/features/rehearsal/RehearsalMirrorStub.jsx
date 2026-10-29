// Заглушка акта 5 «Зеркало»: пока модуль src/features/rehearsal/mirror/ (запись дубля, сравнение «диктор / ты», одна заметка Пита) не подключён, экран просто пропускает дальше.
// Когда зеркало будет готово, этот файл заменяет <WordLaneMirror …/> в RehearsalActs.jsx (контракт — в отчёте и в rehearsalStages.js: стадии take и mirror).
export default function RehearsalMirrorStub({ onNext }) {
  return (
    <div className="wlReveal rhScreen" data-testid="rh-mirror">
      <div className="wlRevealLabel">Дубль и зеркало</div>
      <div className="wlRevealText">Зеркало — скоро</div>
      <button type="button" className="wlNext" onClick={onNext} data-testid="rh-mirror-next">Дальше</button>
    </div>
  )
}
