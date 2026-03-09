import { useEffect, useState } from "react";
import { marked } from "marked";
import "../styles/MarkdownContent.less";

interface MarkdownContentProps {
  content: string;
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    marked.setOptions({
      breaks: true,
      gfm: true
    });

    setHtml(marked.parse(content || "") as string);
  }, [content]);

  return <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />;
}
