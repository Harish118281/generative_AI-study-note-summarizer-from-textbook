import { memo, type ComponentPropsWithoutRef } from 'react'
import './Table.css'

type TableProps = ComponentPropsWithoutRef<'table'> & {
  node?: unknown
}

function Table({ children, node, ...tableProps }: TableProps) {
  void node

  return (
    <div className="markdown-table-scroll">
      <table className="markdown-table" {...tableProps}>
        {children}
      </table>
    </div>
  )
}

export default memo(Table)
