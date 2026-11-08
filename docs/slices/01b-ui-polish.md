# Slice 1b: UI polish

A visual pass on the screens from slices 0 and 1, asked for by archit on 7 Nov. No API changes.

## Scope

- Tokens: forest, sage and leaf colours for dark brand panels, a floating shadow, a button
  highlight, a focus ring for inputs, and one entrance animation (`.rise`).
- Buttons: single-hue gradient, press feedback. Inputs: focus ring, optional trailing control.
- `PasswordField`: Show/Hide toggle on every password input (login, signup, reset).
- Auth screens: split layout on large screens, with a brand panel listing true product facts.
- Home: header with Log in and List your business, hero with a "how booking works" card,
  three promises, a business section and a footer with Terms and Privacy.

## Second pass (8 Nov): match the approved canvas

- Home follows the canvas's landing board: floating nav bar, three-line display headline,
  stats row, photo hero with a booking strip, two audience cards, the seven-step lifecycle,
  four feature cards and a dark footer. Venues, ratings, pricing and the search bar stay out
  until they are real.
- Buttons move from pills to the canvas's 14px radius and bolder labels.
- Photos: archit chose AI-generated images (8 Nov) until venues supply real ones. Two were
  made with Figma AI and are self-hosted in `web/public/photos/`, served through `next/image`.
  They show no real venue or person.

## Decisions

- References came from 21st.dev (split sign-in, search hero). The patterns were rebuilt with
  our tokens instead of installing them, to avoid shadcn, Radix, motion and lucide as
  dependencies for a few screens.
- The home booking card shows the booking flow with sample times and no venue, price or
  rating, so it is not a fake listing.
- Entrance animation is off under `prefers-reduced-motion`, and e2e runs with reduced motion
  so axe checks contrast on settled pages.

## Acceptance

- e2e: a password can be shown and hidden again (`aria-pressed` follows).
- axe WCAG 2.2 AA clean on every page tested; Lighthouse performance and accessibility unchanged.
