import { ButtonLink } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/wordmark";

// Holding page until the marketplace ships in slice 5. No prices, venues or ratings
// appear here until they are real.
export default function Home() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6">
        <Wordmark />
      </header>
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16">
        <p className="text-xs font-semibold uppercase tracking-[var(--tracking-label)] text-spruce">
          Coming soon to Riga
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold leading-tight sm:text-6xl">
          Book your wellness rituals.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted">
          Find salons, spas and studios near you, see real open times, and pay at the venue.
        </p>
        <div className="mt-10">
          <ButtonLink href="/design" variant="secondary" size="lg">
            See the design system
          </ButtonLink>
        </div>
      </main>
    </>
  );
}
