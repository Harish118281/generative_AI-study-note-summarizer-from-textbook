import { memo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import BlockQuote from './BlockQuote'
import CodeBlock from './CodeBlock'
import Table from './Table'
import 'katex/dist/katex.min.css'
import './MarkdownRenderer.css'

type MarkdownRendererProps = {
  content: string
}

type AnchorProps = ComponentPropsWithoutRef<'a'> & {
  node?: unknown
}

type ImageProps = ComponentPropsWithoutRef<'img'> & {
  node?: unknown
}

function MarkdownLink({
  children,
  href,
  node,
  ...anchorProps
}: AnchorProps) {
  void node

  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      {...anchorProps}
    >
      {children}
    </a>
  )
}

function MarkdownImage({ alt = '', node, ...imageProps }: ImageProps) {
  void node

  return (
    <img
      alt={alt}
      decoding="async"
      loading="lazy"
      {...imageProps}
      onError={(event) => {
        const image = event.currentTarget
        const paragraph = image.closest('p')
        const imageCount = paragraph?.querySelectorAll('img').length ?? 0
        const hasText = Array.from(paragraph?.childNodes ?? []).some(
          (child) =>
            child.nodeType === Node.TEXT_NODE && Boolean(child.textContent?.trim()),
        )

        image.closest('a')?.setAttribute('hidden', '')
        image.hidden = true

        if (paragraph && imageCount === 1 && !hasText) {
          paragraph.hidden = true
        }
      }}
    />
  )
}

const markdownComponents: Components = {
  a: MarkdownLink,
  blockquote: BlockQuote,
  img: MarkdownImage,
  pre: CodeBlock,
  table: Table,
}

function normalizeRawSvgBlocks(content: string) {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith('```')) {
        return segment
      }

      return segment.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => {
        return `\n\n\`\`\`svg\n${svg.trim()}\n\`\`\`\n\n`
      })
    })
    .join('')
}

function normalizeLatexDelimiters(content: string) {
  return content
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => {
      return `$$${formula.trim()}$$`
    })
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => {
      return `$${formula.trim()}$`
    })
}

function normalizeMarkdownImageSizing(content: string) {
  return content.replace(
    /(\]\([^\n)]*\))\s*\{\s*width\s*=\s*\d+\s*px\s*\}/gi,
    '$1',
  )
}

function protectCurrencyDollars(content: string) {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith('```')) {
        return segment
      }

      return segment
        .replace(/\\\$(?=\d)/g, '&#36;')
        .replace(
          /(^|[^\\])\$(?=\d+(?:\.\d+)?(?:\s+[A-Za-z]|[,.)]))/g,
          '$1&#36;',
        )
    })
    .join('')
}

function normalizeSimpleMathTokens(content: string) {
  const simpleMathPattern = /^[0-9\s.,+\-*/=()xX\u00d7\u00f7\u2212]+$/

  return content
    .split(/(```[\s\S]*?```)/g)
    .map((segment) => {
      if (segment.startsWith('```')) {
        return segment
      }

      return segment
        .replace(/\$\$([\s\S]*?)\$\$/g, (match, formula: string) => {
          const trimmedFormula = formula.trim()
          return simpleMathPattern.test(trimmedFormula) ? trimmedFormula : match
        })
        .replace(/\$([^$\n]+)\$/g, (match, formula: string) => {
          const trimmedFormula = formula.trim()
          return simpleMathPattern.test(trimmedFormula) ? trimmedFormula : match
        })
    })
    .join('')
}

function normalizeMathEscapes(content: string) {
  return content.replace(/\${1,2}[\s\S]*?\${1,2}/g, (mathBlock) =>
    mathBlock
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
      .replace(/\s\/=\s/g, ' \\ne '),
  )
}

function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const renderedContent = normalizeMathEscapes(
    normalizeSimpleMathTokens(
      protectCurrencyDollars(
        normalizeMarkdownImageSizing(
          normalizeLatexDelimiters(normalizeRawSvgBlocks(content)),
        ),
      ),
    ),
  )

  return (
    <div className="markdown-renderer">
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  )
}

export default memo(MarkdownRenderer)
