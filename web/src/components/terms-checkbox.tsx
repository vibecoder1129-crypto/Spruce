import Link from "next/link";

/** The required terms box, with its error under it and linked to it for screen readers. */
export function TermsCheckbox({ error, onChange }: { error?: string; onChange: () => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="terms"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "terms-error" : undefined}
          onChange={onChange}
          className="mt-0.5 size-5 shrink-0 accent-spruce"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="font-semibold text-spruce underline underline-offset-4">
            terms
          </Link>{" "}
          and have read the{" "}
          <Link href="/privacy" className="font-semibold text-spruce underline underline-offset-4">
            privacy notice
          </Link>
          .
        </span>
      </label>
      {error && (
        <p id="terms-error" className="-mt-2 pl-8 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
