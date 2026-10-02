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
import {
  MAX_REQUEST_BYTES,
  MAX_TEXT_FILE_BYTES,
  MIN_TEXT_LENGTH,
} from "@/lib/constants";
import { isPdfFile, isPlainTextFile } from "@/lib/files";
import { formatBytes, isAcceptedImage, prepareImage } from "@/lib/image";
import { toPlainText } from "@/lib/format";
import { DEFAULT_LANGUAGE, LANGUAGES } from "@/lib/languages";
import type { AiStatus } from "@/services/ai";
import type { ExplainResult } from "@/services/ai/schemas";
import type { PreparedImage } from "@/lib/image";

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

/** Matches the server's minimum (lib/constants), so the form answers first. */

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
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);

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
  const hasEnoughText = trimmedLength >= MIN_TEXT_LENGTH;
  // A photo on its own is a complete request; text on its own must be long
  // enough to read. Mirrors the server's rule so the form answers first.
  const canSubmit =
    status.ready && (hasEnoughText || photo !== null) && phase !== "loading";

  /**
   * A text file is read locally, with no round trip. A PDF is sent to the
   * server to have its text pulled out, and the result is put straight into the
   * box below — so the reader sees exactly what will be analysed, and every
   * quote is later checked against that same text.
   */
  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Allow the same file to be chosen twice in a row.
      event.target.value = "";
      if (!file) return;

      setNotice(null);

      if (isPdfFile(file)) {
        if (file.size > MAX_REQUEST_BYTES) {
          setNotice("That PDF is too large to read. Try one section at a time.");
          return;
        }

        setFileBusy(true);
        try {
          const response = await fetch("/api/extract-text", {
            method: "POST",
            headers: { "content-type": "application/pdf" },
            body: file,
          });

          const payload = (await response.json().catch(() => null)) as
            | { text: string; pages: number; truncated: boolean }
            | { error?: string }
            | null;

          if (!response.ok) {
            setNotice(
              (payload as { error?: string } | null)?.error ??
                "We could not read that PDF. Try another file, or paste the text instead.",
            );
            return;
          }

          const document = payload as {
            text: string;
            pages: number;
            truncated: boolean;
          };

          setText(document.text);
          setNotice(
            `Read ${document.pages} page${
              document.pages === 1 ? "" : "s"
            } of text. Check it looks right below, then press "Read it for me".${
              document.truncated ? " Only the beginning was kept." : ""
            }`,
          );
        } catch {
          setNotice(
            "We could not reach the app to read that PDF. Check your internet connection and try again.",
          );
        } finally {
          setFileBusy(false);
        }
        return;
      }

      if (!isPlainTextFile(file)) {
        setNotice(
          "That file is neither text nor a PDF. Try a .txt, .md, .csv or .pdf.",
        );
        return;
      }

      if (file.size > MAX_TEXT_FILE_BYTES) {
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
    },
    [],
  );

  const handlePhoto = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Allow the same file to be chosen twice in a row.
      event.target.value = "";
      if (!file) return;

      setNotice(null);

      if (!isAcceptedImage(file)) {
        setNotice("That file is not a photo we can read. Try a JPEG, PNG or WebP.");
        return;
      }

      setPhotoBusy(true);
      try {
        const prepared = await prepareImage(file);
        if (!prepared.ok) {
          setNotice(prepared.message);
          return;
        }
        setPhoto(prepared.image);
        setNotice(
          `Photo ready — ${formatBytes(prepared.image.bytes)} will be sent when you press "Read it for me". Nothing has left this device yet.`,
        );
      } finally {
        setPhotoBusy(false);
      }
    },
    [],
  );

  const removePhoto = useCallback(() => {
    setPhoto(null);
    setNotice(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (phase === "loading") return;

      setIssues([]);
      setErrorMessage(null);
      setNotice(null);

      if (!hasEnoughText && photo === null) {
        setErrorMessage(
          "There is not enough here yet. Add a few lines of the document, or a photo of it.",
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
            text: text.trim() === "" ? undefined : text,
            image: photo
              ? { mediaType: photo.mediaType, dataBase64: photo.dataBase64 }
              : undefined,
            language,
            readerContext:
              readerContext.trim() === "" ? undefined : readerContext.trim(),
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
    [hasEnoughText, language, phase, photo, readerContext, text],
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
          {status.supportsImages ? (
            <>
              Put the words from the document below, or add a photo of it, and
              press &ldquo;Read it for me&rdquo;. You will get what the document
              is, what it asks of you and by when, and the exact lines each
              answer came from &mdash; in the language you are comfortable
              reading.
            </>
          ) : (
            <>
              Put the words from the document below and press &ldquo;Read it for
              me&rdquo;. You will get what the document is, what it asks of you
              and by when, and the exact lines each answer came from &mdash; in
              the language you are comfortable reading.
            </>
          )}
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

        {status.supportsImages && (
          <div>
            <label
              htmlFor="document-photo"
              className="block text-sm font-medium text-ink"
            >
              Or add a photo of the document
            </label>
            <p id="document-photo-hint" className="mt-1 text-sm text-muted">
              A clear photo of the whole page works best. It is shrunk on your
              own device before anything is sent anywhere.
            </p>
            <input
              id="document-photo"
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handlePhoto}
              aria-describedby="document-photo-hint"
              className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
            />

            {photoBusy && (
              <p role="status" className="mt-2 text-xs text-muted">
                Preparing the photo&hellip;
              </p>
            )}

            {photo && (
              <div className="mt-3 flex items-center gap-3">
                {/* A data URL is the only sensible source here, so next/image
                    would add cost with no benefit. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${photo.mediaType};base64,${photo.dataBase64}`}
                  alt="The photograph of the document that will be read"
                  className="h-20 w-20 rounded border border-line object-cover"
                />
                <div className="text-xs text-muted">
                  <p>{formatBytes(photo.bytes)} ready to send.</p>
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="mt-1 font-medium text-accent-strong underline"
                  >
                    Remove this photo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label
            htmlFor="document-file"
            className="block text-sm font-medium text-ink"
          >
            Or add a file
          </label>
          <input
            id="document-file"
            name="file"
            type="file"
            accept=".txt,.md,.csv,.log,.json,text/plain,application/pdf,.pdf"
            onChange={handleFile}
            aria-describedby="document-file-hint"
            className="mt-2 block w-full text-sm text-muted file:mr-3 file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
          />
          <p id="document-file-hint" className="mt-1 text-xs text-muted">
            Plain text (.txt, .md, .csv) or a PDF. A PDF&rsquo;s text is read out
            and put in the box above, so you can check it before anything is
            analysed.
            {status.supportsImages
              ? " For a photograph of a page, use the photo box above."
              : " Photographing a page needs a model that can see — see the README."}
          </p>
          {fileBusy && (
            <p role="status" className="mt-2 text-xs text-muted">
              Reading the file&hellip;
            </p>
          )}
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
            disabled={phase === "loading" || fileBusy || photoBusy}
            aria-busy={phase === "loading"}
          >
            {phase === "loading" ? "Reading…" : "Read it for me"}
          </button>
          {!canSubmit && phase !== "loading" && status.ready && (
            <p className="text-sm text-muted">
              Add at least {MIN_TEXT_LENGTH} characters of the document
              {status.supportsImages ? ", or a photo of it," : ""} to begin.
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
                setPhoto(null);
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