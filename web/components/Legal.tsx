import type { ReactNode } from "react";
import { COMPANY, LEGAL_UPDATED } from "@/legal/company";
import { LEGAL } from "@/legal/texts";
import { fill } from "@/lib/site";

/** **bold** inside a line; everything else is plain text (no HTML from the texts reaches the page). */
function inline(line: string): ReactNode[] {
  return line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

/**
 * The terms or the privacy policy in the edition's base language (web/legal/texts.ts), with the company details from
 * web/legal/company.ts. Server-rendered: a plain page anyone can read and link to, also before using the app.
 */
export function Legal({ base, which }: { base: string; which: "terms" | "privacy" }) {
  const texts = LEGAL[base] ?? LEGAL.en;
  const values = { ...COMPANY, updated: LEGAL_UPDATED };
  const blocks = fill(texts[which], values).split(/\n\s*\n/);
  return (
    <main className="legal">
      <h1>{texts.titles[which]}</h1>
      <p className="muted small">{fill(texts.updated, values)}</p>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const out: ReactNode[] = [];
        let items: string[] = [];
        const flush = () => {
          if (items.length) out.push(<ul key={`u${out.length}`}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
          items = [];
        };
        for (const line of lines) {
          if (line.startsWith("- ")) items.push(line.slice(2));
          else {
            flush();
            if (line.startsWith("## ")) out.push(<h2 key={`h${out.length}`}>{line.slice(3)}</h2>);
            else if (line.trim()) out.push(<p key={`p${out.length}`}>{inline(line)}</p>);
          }
        }
        flush();
        return <section key={i}>{out}</section>;
      })}
    </main>
  );
}

export const legalTitle = (base: string, which: "terms" | "privacy") => (LEGAL[base] ?? LEGAL.en).titles[which];
