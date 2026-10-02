import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl leading-snug text-ink">
        That page isn&rsquo;t here
      </h1>
      <p className="max-w-prose text-base leading-relaxed text-muted">
        The link may be old or mistyped. Nothing has gone wrong with your
        document &mdash; there is only one page in this app, and it is the
        reader.
      </p>
      <Link
        href="/"
        className="inline-block rounded-md bg-accent px-5 py-3 text-base font-semibold text-surface transition-colors hover:bg-accent-strong"
      >
        Go to the document reader
      </Link>
    </div>
  );
}