import { memo, type ComponentPropsWithoutRef } from 'react'
import './BlockQuote.css'

type BlockQuoteProps = ComponentPropsWithoutRef<'blockquote'> & {
  node?: unknown
}

function BlockQuote({ children, node, ...quoteProps }: BlockQuoteProps) {
  void node

  return (
    <blockquote className="markdown-blockquote" {...quoteProps}>
      {children}
    </blockquote>
  )
}

export default memo(BlockQuote)
