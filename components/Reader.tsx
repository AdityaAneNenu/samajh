"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { ResultView } from "./ResultView";
import { toPlainText } from "@/lib/format";
import { DEFAULT_LANGUAGE, LANGUAGES } from "@/lib/languages";
import type { AiStatus } from "@/services/ai";
import type { ExplainResult } from "@/services/ai/schemas";

interface ApiIssue {
  field: string;
  message: string;
}

interface ApiErrorBody {
  error?: string;
  kind?: string;
  issues?: ApiIssue[];
}

type Phase = "idle" | "loading" | "done" | "error";

/** Matches the server's minimum, so the form answers before a round trip. */
const MIN_TEXT_LENGTH = 40;

/** Shared button styling, so every control in the flow looks the same. */
const BUTTON =
  "rounded-md border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper";
const BUTTON_PRIMARY =
  "rounded-md bg-accent px-5 py-3 text-base font-semibold text-surface transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60";

export function Reader({ status }: { status: AiStatus }) {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [readerContext, setReaderContext] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ExplainResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [issues, setIssues] = useState<ApiIssue[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // Move focus where the new content actually is, so keyboard and screen
  // reader users are not left behind at the top of the form.
  useEffect(() => {
    if (phase === "done") resultRef.current?.focus();
    if (phase === "error") errorRef.current?.focus();
  }, [phase]);

  const maxChars = status.maxInputChars;
  const tooLong = maxChars !== null && text.length > maxChars;
  const trimmedLength = text.trim().length;
  const canSubmit =
    status.ready && trimmedLength >= MIN_TEXT_LENGTH && phase !== "loading";

  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setNotice(null);

    if (file.size > 400_000) {
      setNotice(
        "That file is large. It is easier on everyone to read one section at a time.",
      );
      return;
    }

    try {
      setText(await file.text());
    } catch {
      setNotice(
        "We could not open that file. Try copying the text and pasting it instead.",
      );
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (phase === "loading") return;

      setIssues([]);
      setErrorMessage(null);
      setNotice(null);

      if (trimmedLength < MIN_TEXT_LENGTH) {
        setErrorMessage(
          "There is not enough text here yet. Add a few lines from the document first.",
        );
        setPhase("error");
        return;
      }

      setPhase("loading");
      setResult(null);

      try {
        const response = await fetch("/api/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text,
            language,
            readerContext: readerContext.trim() === "" ? undefined : readerContext.trim(),
          }),
        });

        const payload = (await response.json().catch(() => null)) as
          | ExplainResult
          | ApiErrorBody
          | null;

        if (!response.ok) {
          const body = (payload ?? {}) as ApiErrorBody;
          setIssues(body.issues ?? []);
          setErrorMessage(
            body.error ?? "We could not read this document. Please try again.",
          );
          setPhase("error");
          return;
        }

        setResult(payload as ExplainResult);
        setPhase("done");
      } catch {
        setErrorMessage(
          "We could not reach the app. Check your internet connection and try again.",
        );
        setPhase("error");
      }
    },
    [language, phase, readerContext, text, trimmedLength],
  );

  const handleCopy = useCallback(async () => {
    if (!result) return;
    setNotice(null);
    try {
      await navigator.clipboard.writeText(toPlainText(result));
      setNotice("Copied. You can paste it into a message for someone.");
    } catch {
      setNotice(
        "We could not copy automatically. Select the text and copy it by hand.",
      );
    }
  }, [result]);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="font-serif text-2xl leading-snug text-ink sm:text-3xl">
          A letter you do not fully understand?
        </h1>
        <p className="max-w-prose text-base leading-relaxed text-muted">
          Put the words from the document below, or add the text file, and press
          &ldquo;Read it for me&rdquo;. You will get what the document is, what
          it asks of you and by when, and the exact lines each answer came from
          &mdash; in the language you are comfortable reading.
        </p>
      </div>

      {!status.ready && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft p-4 text-sm text-warn">
          <p className="font-medium">
            This app is not connected to a model yet.
          </p>
          <p className="mt-2">
            Whoever set it up still needs to fill in{" "}
            <code className="rounded bg-surface px-1 py-0.5">
              {status.missing.join(", ")}
            </code>
            . See .env.example and the README.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-lg border border-line bg-surface p-5 no-print"
      >
        <div>
          <label
            htmlFor="document-text"
            className="block text-sm font-medium text-ink"
          >
            The words from the document
          </label>
          <p id="document-text-hint" className="mt-1 text-sm text-muted">
            Copy and paste the text, or type out the important part. Do not
            worry about line breaks or spacing.
          </p>
          <textarea
            id="document-text"
            name="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={10}
            aria-describedby="document-text-hint document-text-count"
            className="mt-2 w-full rounded-md border border-line-strong bg-paper p-3 font-serif text-base leading-relaxed text-ink"
            placeholder="Dear Sir, With reference to your account no. ..."
          />
          <p id="document-text-count" className="mt-1 text-xs text-muted">
            {text.length.toLocaleString()} characters
            {tooLong && maxChars !== null && (
              <span className="text-warn">
                {" "}
                &mdash; longer than we read in one go, so the beginning will be
                used.
              </span>
            )}
          </p>
        </div>

        <div>
          <label
            htmlFor="document-file"
            className="block text-sm font-medium text-ink"
          >
            Or add a text file
          </label>
          <input
            id="document-file"
            name="file"
            type="file"
            accept=".txt,.md,.csv,.log,.json,text/plain"
            onChange={handleFile}
            className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          <p className="mt-1 text-xs text-muted">
            This setup reads text. Photographing a paper letter needs a model
            that can see — see the README.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="language"
              className="block text-sm font-medium text-ink"
            >
              Explain it in
            </label>
            <select
              id="language"
              name="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="mt-2 w-full rounded-md border border-line-strong bg-paper p-3 text-base text-ink"
            >
              {LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.nativeLabel} — {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="reader-context"
              className="block text-sm font-medium text-ink"
            >
              Who is reading this?{" "}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="reader-context"
              name="readerContext"
              type="text"
              value={readerContext}
              onChange={(event) => setReaderContext(event.target.value)}
              maxLength={300}
              aria-describedby="reader-context-hint"
              placeholder="my mother, 68, reads Telugu, not legal English"
              className="mt-2 w-full rounded-md border border-line-strong bg-paper p-3 text-base text-ink"
            />
            <p id="reader-context-hint" className="mt-1 text-xs text-muted">
              Used only to pitch the explanation. Never stored.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={BUTTON_PRIMARY}
            disabled={phase === "loading"}
            aria-busy={phase === "loading"}
          >
            {phase === "loading" ? "Reading…" : "Read it for me"}
          </button>
          {trimmedLength < MIN_TEXT_LENGTH && phase !== "loading" && (
            <p className="text-sm text-muted">
              Add at least {MIN_TEXT_LENGTH} characters of the document to
              begin.
            </p>
          )}
        </div>
      </form>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-line-strong bg-paper p-3 text-sm text-muted"
        >
          {notice}
        </p>
      )}

      {phase === "error" && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-warn/30 bg-warn-soft p-4"
        >
          <p className="font-medium text-warn">We could not read this one.</p>
          <p className="mt-2 text-sm text-warn">{errorMessage}</p>

          {issues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-warn">
              {issues.map((issue) => (
                <li key={`${issue.field}:${issue.message}`}>
                  <span className="font-medium">{issue.field}</span>:{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setPhase("idle")}
            className={`${BUTTON} mt-4`}
          >
            Try again
          </button>
        </div>
      )}

      {phase === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-line bg-surface p-5"
        >
          <p className="font-medium text-ink">Reading your document…</p>
          <p className="mt-1 text-sm text-muted">
            This usually takes a few seconds. Nothing is saved anywhere.
          </p>
          <div className="mt-4 space-y-3" aria-hidden="true">
            <div className="h-3 w-2/3 rounded bg-line animate-pulse" />
            <div className="h-3 w-full rounded bg-line animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-line animate-pulse" />
          </div>
        </div>
      )}

      {phase === "done" && result && (
        <div ref={resultRef} tabIndex={-1} className="space-y-8">
          <ResultView result={result} />

          <div className="flex flex-wrap gap-3 no-print">
            <button type="button" onClick={handleCopy} className={BUTTON}>
              Copy this explanation
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className={BUTTON}
            >
              Print it
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setPhase("idle");
              }}
              className={BUTTON}
            >
              Read another document
            </button>
          </div>
        </div>
      )}
    </div>
  );
}