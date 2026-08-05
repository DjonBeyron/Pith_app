import ProductionRow from './ProductionRow.jsx'
import InsertNodeButton from './InsertNodeButton.jsx'

function labelClass(key) {
  if (key === 'primary') return 'productionPairLabel productionPairLabelOk'
  if (key === 'branch') return 'productionPairLabel productionPairLabelErr'
  return 'productionPairLabel productionPairLabelVariant'
}

// Ряд параллельных колонок под нодой-развилкой: обычно 2 (Верно/Неверно —
// как раньше), но с особыми переходами по вариантам ответа (nodeVariants.js)
// колонок может быть больше — тогда ряд получает горизонтальный скролл,
// т.к. фиксированной ширины экрана на 4-5+ колонок не хватит. Кнопка
// «слияния» (+ между колонками, продолжает урок одной нодой независимо от
// ответа) осталась только для классического случая ровно 2 колонок — для
// N колонок это отдельная невостребованная фича, не делаем.
export default function ProductionFanRow({ columns, rowProps, insertAfterNode, insertBetweenBoth }) {
  const wide = columns.length > 2
  const gridStyle = wide ? { gridTemplateColumns: `repeat(${columns.length}, 300px)` } : undefined

  return (
    <div className={wide ? 'productionFanScroll' : undefined}>
      <div className={wide ? 'productionFanGrid' : 'productionPairGrid'} style={gridStyle}>
        {columns.map(c => (
          <div key={c.key} className={wide ? 'productionFanCol' : 'productionPairCol'}>
            <span className={labelClass(c.key)}>{c.label}</span>
            <ProductionRow {...rowProps(c.node)} />
          </div>
        ))}
      </div>
      <div className={wide ? 'productionFanInsertRow' : 'productionPairInsertRow'} style={gridStyle}>
        {wide ? columns.map(c => (
          <InsertNodeButton
            key={c.key}
            label="+ Ниже (Ctrl+Enter)"
            onInsert={type => insertAfterNode(c.node.id, type)}
          />
        )) : (
          <>
            <InsertNodeButton
              label="+ Добавить ноду ниже (Ctrl+Enter)"
              onInsert={type => insertAfterNode(columns[0].node.id, type)}
            />
            <InsertNodeButton
              label="+"
              className="productionInsertBtnMerge"
              title="Добавить ноду ниже в ОБЕ ветки — урок продолжится ею независимо от ответа"
              onInsert={type => insertBetweenBoth(columns[0].node.id, columns[1].node.id, type)}
            />
            <InsertNodeButton
              label="+ Добавить ноду ниже (Ctrl+Enter)"
              onInsert={type => insertAfterNode(columns[1].node.id, type)}
            />
          </>
        )}
      </div>
    </div>
  )
}
