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

## Decisions

- References came from 21st.dev (split sign-in, search hero). The patterns were rebuilt with
  our tokens instead of installing them, to avoid shadcn, Radix, motion and lucide as
  dependencies for a few screens.
- The home booking card shows the booking flow with sample times and no venue, price or
  rating, so it is not a fake listing.
- Entrance animation is off under `prefers-reduced-motion`, and e2e runs with reduced motion
  so axe checks contrast on settled pages.
- The botanical sprig is generated SVG, a few hundred bytes, so pages stay image-free.

## Acceptance

- e2e: a password can be shown and hidden again (`aria-pressed` follows).
- axe WCAG 2.2 AA clean on every page tested; Lighthouse performance and accessibility unchanged.
