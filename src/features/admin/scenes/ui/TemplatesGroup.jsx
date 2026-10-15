import { useState } from 'react'
import { fromScene } from '../builderModel.js'
import { TEMPLATE_CONFIRM } from './sceneUseOptions.js'
import { templateList, needsTemplateConfirm, templateScene } from './sceneTemplates.js'
import ScTip from '../ScTip.jsx'

// Группа «Шаблоны» в «Моих сценах»: встроенные демо-сцены («Про работу», «Кофе-брейк») и
// пустой шаблон (sceneTemplates.js). «Использовать как основу» — копия шаблона становится
// черновиком сборщика (отвязанным от библиотеки). Если в сборщике есть несохранённые правки —
// подтверждение прямо в строке (не confirm()).
export default function TemplatesGroup({ draft, setStatus }) {
  const [ask, setAsk] = useState(null) // id шаблона, ждущего подтверждения
  const use = t => {
    if (ask !== t.id && needsTemplateConfirm(draft)) { setAsk(t.id); return }
    setAsk(null)
    draft.actions.load(fromScene(templateScene(t)), null, `шаблон «${t.title}»`)
    setStatus({ kind: 'ok', text: `Шаблон «${t.title}» загружен в сборщик — это копия, сохраните её как новую сцену` })
  }
  return (
    <div className="scbTemplates">
      <p className="scbGroupH">Шаблоны <ScTip help="use_template" /></p>
      <ul className="scbLibList">
        {templateList().map(t => (
          <li key={t.id} className="scbLibRow scbTplRow">
            <div className="scbLibMain">
              <span className="scbLibTitle scbTplTitle">{t.title}</span>
              <span className="scbSub">{t.note}</span>
            </div>
            <div className="scbLibBtns">
              {ask === t.id ? (
                <span className="scbAsk" role="alert">
                  {TEMPLATE_CONFIRM} <button type="button" className="fsBtn fsBtnSmall" onClick={() => use(t)}>Да, заменить</button>
                  <button type="button" className="fsBtn fsBtnSmall" onClick={() => setAsk(null)}>Отмена</button>
                </span>
              ) : (
                <button type="button" className="fsBtn fsBtnSmall" onClick={() => use(t)}>Использовать как основу</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
