import type { QuoteLocation } from "@/services/ai/schemas";

/**
 * Show a quote in its place in the document.
 *
 * This is the feature the whole project is built around. A quote on its own
 * proves nothing — it could be stitched together from three different
 * paragraphs. Showing the surrounding sentences lets the reader see for
 * themselves that the words are real, in order, and in context.
 *
 * Nothing here is rendered as HTML. React escapes it, so a letter that happens
 * to contain markup is just text.
 */
export function QuoteLocationBlock({
  location,
}: {
  location: QuoteLocation;
}) {
  return (
    <details className="mt-2 text-xs no-print">
      <summary className="cursor-pointer text-muted underline decoration-dotted underline-offset-2">
        Show where this is in the document (line {location.line})
      </summary>
      <p className="mt-2 rounded border border-line bg-paper p-3 font-serif text-sm leading-relaxed text-muted">
        {location.trimmed && <span aria-hidden="true">&hellip;&nbsp;</span>}
        {location.before}
        {location.before ? " " : ""}
        <mark className="rounded bg-accent-soft px-0.5 text-ink">
          {location.match}
        </mark>
        {location.after ? " " : ""}
        {location.after}
        {location.trimmed && <span aria-hidden="true">&nbsp;&hellip;</span>}
      </p>
    </details>
  );
}