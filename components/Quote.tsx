/**
 * A quote pulled from the original document.
 *
 * When the quote could not be found in the text the reader supplied, that is
 * said plainly instead of being hidden. Showing an unverified quote is a
 * deliberate choice: silently dropping it would leave a gap the reader cannot
 * see, and silently trusting it would be a lie.
 */
export function Quote({
  text,
  verified,
  suppressWarning = false,
}: {
  text: string;
  verified: boolean;
  /**
   * True when nothing could be checked at all — for example a reading taken
   * from a photograph with no text to compare against. Showing "we could not
   * find this wording" on every line would be both wrong and alarming; the
   * result view explains the situation once, instead.
   */
  suppressWarning?: boolean;
}) {
  return (
    <blockquote className="print-block mt-2 border-l-2 border-line-strong pl-3">
      <p className="font-serif text-sm leading-relaxed text-muted">
        <span aria-hidden="true">&ldquo;</span>
        {text}
        <span aria-hidden="true">&rdquo;</span>
      </p>
      {!verified && !suppressWarning && (
        <p className="mt-1 text-xs font-medium text-warn">
          <span aria-hidden="true">⚠ </span>
          We could not find this exact wording in the document you gave us.
        </p>
      )}
    </blockquote>
  );
}