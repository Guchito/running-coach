import React from "react";

// Minimal, safe markdown renderer for coach replies. Handles headings,
// bullet lists, bold/italic/code inline, and paragraphs. Produces React
// nodes (no dangerouslySetInnerHTML), so input is never injected as HTML.

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenize on **bold**, *italic*, `code`.
  const regex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<em key={`${keyBase}-i${i}`}>{m[3]}</em>);
    else if (m[4] !== undefined)
      nodes.push(
        <code key={`${keyBase}-c${i}`} className="px-1 py-0.5 rounded bg-black/[0.05] text-[0.85em] font-mono">
          {m[4]}
        </code>
      );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${key++}`}>{renderInline(para.join(" "), `p${key}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`u${key++}`}>
          {list.map((li, idx) => (
            <li key={idx}>{renderInline(li, `u${key}-${idx}`)}</li>
          ))}
        </ul>
      );
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (bullet) {
      flushPara();
      list.push(bullet[1]);
    } else if (heading) {
      flushPara();
      flushList();
      const lvl = heading[1].length;
      const Tag = (lvl === 1 ? "h1" : lvl === 2 ? "h2" : "h3") as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag key={`h${key++}`}>{renderInline(heading[2], `h${key}`)}</Tag>);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className="prose-coach">{blocks}</div>;
}
