import {
  Children,
  isValidElement,
  memo,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c'
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp'
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go'
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust'
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import CopyButton from './CopyButton'
import SvgDiagram from './SvgDiagram'
import TextDiagram from './TextDiagram'
import './CodeBlock.css'

type CodeElementProps = {
  className?: unknown
  children?: ReactNode
}

type CodeBlockProps = ComponentPropsWithoutRef<'pre'> & {
  node?: unknown
}

SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('c', c)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('csharp', csharp)
SyntaxHighlighter.registerLanguage('css', css)
SyntaxHighlighter.registerLanguage('go', go)
SyntaxHighlighter.registerLanguage('java', java)
SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('php', php)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('rust', rust)
SyntaxHighlighter.registerLanguage('sql', sql)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('yaml', yaml)

const languageAliases: Record<string, string> = {
  cs: 'csharp',
  html: 'markup',
  js: 'javascript',
  md: 'markdown',
  py: 'python',
  shell: 'bash',
  sh: 'bash',
  svg: 'svg',
  ts: 'typescript',
  xml: 'markup',
  yml: 'yaml',
  zsh: 'bash',
}

function normalizeLanguage(language: string) {
  const normalizedLanguage = language.toLowerCase()
  return languageAliases[normalizedLanguage] ?? normalizedLanguage
}

function isTextDiagram(code: string, language: string) {
  if (!['', 'text', 'plain', 'plaintext'].includes(language)) {
    return false
  }

  const lines = code.replace(/\r\n/g, '\n').split('\n').filter(Boolean)

  if (lines.length < 3) {
    return false
  }

  const symbolCount = (code.match(/[-/\\|+_=<>^vV]/g) ?? []).length
  const connectorLineCount = lines.filter((line) =>
    /^[-\s/\\|+_=<>^vV.]+$/.test(line.trim()),
  ).length
  const indentedLineCount = lines.filter((line) => /^\s{2,}\S/.test(line)).length
  const hasRepeatedDiagramChars = /[-_=|]{3,}|[<>]-{2,}|\/\s+\\|\\\s+\//.test(code)

  return (
    (connectorLineCount > 0 || hasRepeatedDiagramChars) &&
    symbolCount >= Math.max(4, lines.length) &&
    indentedLineCount >= 1
  )
}

function nodeToText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child)
      }

      if (isValidElement<CodeElementProps>(child)) {
        return nodeToText(child.props.children)
      }

      return ''
    })
    .join('')
}

function extractCode(children: ReactNode) {
  const child = Children.toArray(children).find((item) =>
    isValidElement<CodeElementProps>(item),
  )

  if (!child || child.type !== 'code') {
    return {
      code: nodeToText(children),
      language: '',
    }
  }

  const className = typeof child.props.className === 'string' ? child.props.className : ''
  const language = /language-([^\s]+)/.exec(className)?.[1] ?? ''
  const code = nodeToText(child.props.children).replace(/\n$/, '')

  return {
    code,
    language,
  }
}

function CodeBlock({ children, node, ...preProps }: CodeBlockProps) {
  void node

  const { code, language } = extractCode(children)
  const highlightedLanguage = normalizeLanguage(language)
  const label = highlightedLanguage || 'text'

  if (highlightedLanguage === 'svg') {
    return <SvgDiagram source={code} />
  }

  if (isTextDiagram(code, highlightedLanguage)) {
    return <TextDiagram source={code} />
  }

  return (
    <figure className="code-block" {...preProps}>
      <figcaption className="code-block-header">
        <span className="code-block-language">{label}</span>
        <CopyButton value={code} />
      </figcaption>

      <SyntaxHighlighter
        PreTag="pre"
        className="code-block-pre"
        codeTagProps={{
          className: 'code-block-code',
        }}
        customStyle={{
          margin: 0,
          padding: '18px 20px',
          borderRadius: 0,
          background: 'transparent',
          fontSize: '14px',
          lineHeight: 1.65,
        }}
        language={highlightedLanguage || 'text'}
        showLineNumbers={false}
        style={oneDark}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </figure>
  )
}

export default memo(CodeBlock)
