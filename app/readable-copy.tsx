import { Fragment } from 'react';

function emphasis(text: string) {
  const label = text.match(/^([^:*\n]{2,24}:)\s+(.+)$/u);
  if (label) return <><strong>{label[1]}</strong>{' '}{inlineEmphasis(label[2])}</>;
  return inlineEmphasis(text);
}

function inlineEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>
  );
}

export default function ReadableCopy({ text, className = '' }: { text?: string; className?: string }) {
  const lines = (text || '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length) return null;

  const blocks: { type: 'paragraph' | 'bullets' | 'numbered'; lines: string[] }[] = [];
  for (const line of lines) {
    const bullet = line.match(/^[-•]\s+(.+)$/);
    const numbered = line.match(/^\d+[.)]\s+(.+)$/);
    const type = bullet ? 'bullets' : numbered ? 'numbered' : 'paragraph';
    const previous = blocks.at(-1);
    const value = bullet?.[1] ?? numbered?.[1] ?? line;
    if (type !== 'paragraph' && previous?.type === type) previous.lines.push(value);
    else blocks.push({ type, lines: [value] });
  }

  return (
    <div className={`readable-copy ${className}`}>
      {blocks.map(({ type, lines }, index) => {
        if (type === 'paragraph') return <p key={index}>{emphasis(lines[0])}</p>;
        const List = type === 'numbered' ? 'ol' : 'ul';
        return <List key={index}>{lines.map((line, item) => <li key={item}>{emphasis(line)}</li>)}</List>;
      })}
    </div>
  );
}
