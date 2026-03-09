import { useEffect, useState, useMemo } from 'react';
import { marked } from 'marked';
import { codeToHtml } from 'shiki';
import '../styles/MarkdownContent.less';

interface MarkdownContentProps {
  content: string;
}

async function highlightCode(code: string, lang: string = 'text'): Promise<string> {
  try {
    const html = await codeToHtml(code, {
      lang: lang || 'text',
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    });
    return html;
  } catch {
    return `<pre><code>${code}</code></pre>`;
  }
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    const renderer = new marked.Renderer();
    
    renderer.link = (href, title, text) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };

    renderer.code = (code, lang) => {
      const language = lang || 'text';
      return `<div class="code-block-wrapper" data-language="${language}">
        <div class="code-block-header">
          <span class="code-block-language">${language}</span>
          <button class="code-copy-btn" onclick="(function(e){
            const code = decodeURIComponent('${encodeURIComponent(code.replace(/'/g, "\\'"))}');
            navigator.clipboard.writeText(code);
            const btn = e.target as HTMLButtonElement;
            const originalText = btn.textContent;
            btn.textContent = '已复制';
            setTimeout(() => { btn.textContent = originalText; }, 2000);
          })(event)">复制</button>
        </div>
        <pre><code class="language-${language}">${marked.Parser.parse(code)}</code></pre>
      </div>`;
    };

    marked.use({
      renderer,
      breaks: true,
      gfm: true,
    });

    const parsed = marked.parse(content || '') as string;
    setHtml(parsed);
  }, [content]);

  return (
    <div 
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html || '' }}
    />
  );
};

export default MarkdownContent;
