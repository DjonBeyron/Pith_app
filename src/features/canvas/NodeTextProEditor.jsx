import RichTextField from './rich-text/RichTextField.jsx'
// Про-режим текстовой ноды: второй текст (перевод), который пользователь
// раскрывает в чате кнопкой на пузыре. Настройки: текст, надпись кнопки
// (RU/EN/...), способ появления («напечатать» / «показать сразу»), раскраска
// перевода — прямо в поле (RichTextField), как и у основного текста.
export default function NodeTextProEditor({ tData, onChange, nodeId }) {
  const pro = !!tData.pro
  return (
    <div className="nodeProSection" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <label className="nodeProToggle">
        <input
          type="checkbox"
          checked={pro}
          onChange={e => onChange({ pro: e.target.checked })}
        />
        Про-режим (перевод по кнопке)
      </label>

      {pro && (
        <>
          <div className="nodeProRow">
            <input
              className="nodeProLabelInput"
              value={tData.proLabel ?? ''}
              maxLength={24}
              onChange={e => onChange({ proLabel: e.target.value })}
              placeholder="пусто = иконка"
              title="Надпись на кнопке (пусто — иконка перевода 文A)"
            />
            <select
              className="nodeProRevealSelect"
              value={tData.proReveal ?? 'type'}
              onChange={e => onChange({ proReveal: e.target.value })}
            >
              <option value="type">Напечатать</option>
              <option value="instant">Показать сразу</option>
            </select>
          </div>
          <RichTextField
            field="proText"
            highlightsField="proHighlights"
            value={tData.proText ?? ''}
            highlights={tData.proHighlights ?? []}
            onChange={onChange}
            placeholder="Текст перевода..."
            heightKey={`${nodeId}:proText`}
          />
        </>
      )}
    </div>
  )
}
