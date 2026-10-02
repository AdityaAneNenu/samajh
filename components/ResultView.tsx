import { Quote } from "./Quote";
import { languageLabel } from "@/lib/languages";
import type { ExplainResult } from "@/services/ai/schemas";

/**
 * The whole result, as read by a person.
 *
 * Ordering is deliberate: the gist first (so they get the answer before the
 * detail), then what it asks them to do, then the facts they might need to
 * quote back to somebody. Uncertainty is stated in the same visual weight as
 * everything else — never buried at the bottom in small print.
 */

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-line pt-6">
      <h2 id={id} className="font-serif text-lg text-ink">
        {title}
      </h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

const CONFIDENCE_COPY: Record<
  ExplainResult["confidence"],
  { label: string; className: string }
> = {
  high: {
    label: "Good reading",
    className: "bg-ok-soft text-ok border-ok/30",
  },
  medium: {
    label: "Mostly clear — some gaps",
    className: "bg-accent-soft text-accent-strong border-accent/30",
  },
  low: {
    label: "Not reliable — please check it yourself",
    className: "bg-warn-soft text-warn border-warn/30",
  },
};

export function ResultView({ result }: { result: ExplainResult }) {
  const confidence = CONFIDENCE_COPY[result.confidence];
  const hasFacts = result.keyFacts.length + result.actions.length > 0;

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="document-heading"
        className="rounded-lg border border-line bg-surface p-5 print-block"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="document-heading"
              className="font-serif text-xl leading-snug text-ink"
            >
              {result.documentType}
            </h2>
            {result.sender && (
              <p className="mt-1 text-sm text-muted">From: {result.sender}</p>
            )}
          </div>
          <p
            className={`rounded-full border px-3 py-1 text-xs font-medium ${confidence.className}`}
          >
            {confidence.label}
          </p>
        </div>

        <p className="mt-3 text-xs text-muted">
          Explained in {languageLabel(result.language)}
        </p>

        {result.truncated && (
          <p className="mt-3 rounded border border-line-strong bg-paper p-3 text-sm text-muted">
            This document was long, so only the beginning was read. Add the
            rest separately if the important part is further down.
          </p>
        )}

        {result.groundingSkipped && (
          <p
            role="status"
            className="mt-3 rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn"
          >
            This reading came from a photograph, so we had no text to check the
            quoted lines against. Please compare the quotes with the paper in
            your hand before you act on anything here &mdash; or paste the text
            next time and we will check every line for you.
          </p>
        )}

        {result.unverifiedQuotes > 0 && (
          <p
            role="status"
            className="mt-3 rounded border border-warn/30 bg-warn-soft p-3 text-sm text-warn"
          >
            <strong className="font-semibold">
              {result.unverifiedQuotes} of {result.quotesChecked}
            </strong>{" "}
            quoted lines could not be found in the document you gave us. Those
            lines are marked below. Treat them with care.
          </p>
        )}
      </section>

      <Section
        id="gist"
        title="The gist"
        hint="What this document is telling you, in short."
      >
        <p className="text-base leading-relaxed text-ink">{result.summary}</p>
      </Section>

      <Section id="what-this-is" title="What this is">
        <p className="text-base leading-relaxed text-ink">
          {result.whatThisIs}
        </p>
      </Section>

      {result.actions.length > 0 && (
        <Section
          id="actions"
          title="What it asks you to do"
          hint="Each line is quoted from the document underneath it."
        >
          {result.actions.map((action, index) => (
            <div
              key={index}
              className="rounded-lg border border-line bg-surface p-4 print-block"
            >
              <p className="text-ink">{action.instruction}</p>
              {action.deadline && (
                <p className="mt-2 inline-block rounded border border-accent/30 bg-accent-soft px-2 py-1 text-xs font-medium text-accent-strong">
                  Date mentioned: {action.deadline}
                </p>
              )}
              <Quote
                text={action.quote}
                verified={action.verified}
                suppressWarning={result.groundingSkipped}
                location={action.location}
              />
            </div>
          ))}
        </Section>
      )}

      {result.keyFacts.length > 0 && (
        <Section
          id="key-facts"
          title="Numbers and dates that matter"
          hint="Copied exactly as written, in case you need to quote them back."
        >
          <dl className="space-y-4">
            {result.keyFacts.map((fact, index) => (
              <div key={index} className="print-block">
                <dt className="text-sm font-medium text-muted">
                  {fact.label}
                </dt>
                <dd className="text-base text-ink">{fact.value}</dd>
                <Quote
                  text={fact.quote}
                  verified={fact.verified}
                  suppressWarning={result.groundingSkipped}
                  location={fact.location}
                />
              </div>
            ))}
          </dl>
        </Section>
      )}

      {!hasFacts && (
        <Section id="no-facts" title="Nothing to pick out">
          <p className="text-sm text-muted">
            We did not find amounts or dates here that we could quote back to
            you. That may be accurate for what you gave us, or it may mean the
            text was incomplete.
          </p>
        </Section>
      )}

      {result.watchOutFor.length > 0 && (
        <Section
          id="watch-out"
          title="Worth reading twice"
          hint="Conditions in the document that are easy to miss."
        >
          {result.watchOutFor.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-line bg-surface p-4 print-block"
            >
              <p className="text-ink">{item.note}</p>
              <Quote
                text={item.quote}
                verified={item.verified}
                suppressWarning={result.groundingSkipped}
                location={item.location}
              />
            </div>
          ))}
        </Section>
      )}

      {result.questionsToAsk.length > 0 && (
        <Section
          id="questions"
          title="Questions you could ask"
          hint="Things worth putting to whoever sent this."
        >
          <ul className="list-disc space-y-2 pl-5 text-ink">
            {result.questionsToAsk.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </Section>
      )}

      {result.uncertainAbout.length > 0 && (
        <Section id="uncertain" title="What we are not sure about">
          <ul className="list-disc space-y-2 pl-5 text-ink">
            {result.uncertainAbout.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </Section>
      )}

      <details className="border-t border-line pt-6 text-sm text-muted no-print">
        <summary className="cursor-pointer font-medium text-ink">
          About this reading
        </summary>
        <dl className="mt-3 space-y-2">
          <div>
            <dt className="inline font-medium">Model: </dt>
            <dd className="inline">{result.model}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Time taken: </dt>
            <dd className="inline">{result.elapsedMs} ms</dd>
          </div>
          <div>
            <dt className="inline font-medium">Quotes checked: </dt>
            <dd className="inline">
              {result.groundingSkipped
                ? "not checked — no text version was supplied to compare against"
                : `${result.quotesChecked} checked, ${result.unverifiedQuotes} not found in the document`}
            </dd>
          </div>
        </dl>
      </details>
    </div>
  );
}