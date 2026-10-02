import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Samajh — what does this letter actually say?",
  description:
    "Paste or add a letter, bill or agreement and get a plain-language explanation in your own language. Every fact carries a quote from the original, and the quote is checked against it.",
};

const year = new Date().getFullYear();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col bg-paper font-sans text-ink antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:font-medium focus:text-surface"
        >
          Skip to content
        </a>

        <header className="border-b border-line no-print">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-5 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-serif text-2xl leading-none tracking-tight">
                Samajh
              </p>
              <p className="mt-2 text-sm text-muted">
                What does this letter actually say?
              </p>
            </div>
            <p className="max-w-sm text-xs leading-relaxed text-muted sm:text-right">
              Reads official documents and explains them in plain language.
              Explains, never advises.
            </p>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
          {children}
        </main>

        <footer className="border-t border-line no-print">
          <div className="mx-auto w-full max-w-3xl space-y-2 px-5 py-6 text-xs leading-relaxed text-muted">
            <p>
              Samajh explains what a document says. It does not give legal,
              medical or financial advice, and it is not a substitute for
              someone qualified. Always check anything important with the
              sender or a professional you trust.
            </p>
            <p>
              Open-source AI &middot; MIT licensed &middot; {year}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}