import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { pdfPath, safeUrl } from './messages'

/**
 * Отговор на асистента: GitHub Markdown, където един нов ред е нов ред. Без суров HTML и само
 * http(s) връзки; PDF на фактура се сваля през нашето прокси.
 */
export function Markdown({ text, onDownload }: { text: string; onDownload: (path: string, name: string) => void }) {
  return (
    <div className="ai-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        skipHtml
        urlTransform={safeUrl}
        components={{
          a: ({ href, children }) => {
            const pdf = href ? pdfPath(href) : null
            if (pdf) {
              const name = `invoice-${pdf.match(/\d+/)![0]}.pdf`
              return (
                <button type="button" className="ai-link" onClick={() => onDownload(pdf, name)}>
                  {children}
                </button>
              )
            }
            if (!href) return <span>{children}</span>
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            )
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
