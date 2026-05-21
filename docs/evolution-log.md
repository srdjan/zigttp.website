# Evolution Log

## Iteration 1: zigts Expert Agent Section + Design Polish

- What changed:
  - Added new "Expert Agent" section between Code and Modules showing agent-compiler feedback loop terminal demo
  - Added nav link for Expert section
  - Fixed section-dark alternation (Get Started is now plain since Modules is dark)
  - Fixed terminal pre word-break (was `break-all`, now `overflow-wrap: break-word`)
  - Removed code tab active panel border-left that caused layout shift
  - Added 3-column module grid breakpoint for medium screens (769-1024px)
  - Added gold accent top border on expert terminal for visual weight
  - Added scroll-triggered fade-in for pitch terminal, expert terminal, and CLI reference
  - Added expert section responsive stacking at 768px
- Primary metric: visitor understands the agent-compiler loop within 10 seconds
- Leading indicators: terminal demo pauses scrolling, section fits editorial rhythm
- Guardrails: concise feel preserved, no bloat
- Frontier note: site is feature-complete for the current product scope. Next frontier would be interactive demos, video content, or a dedicated docs site.

## Iteration 2: Live Proof Playground

- What changed:
  - Added a `#playground` section below the hero: a code editor beside a proof card
  - The card runs the real zigts analyzer, compiled to WebAssembly and served from `static/`, so the verdict matches `zigttp dev` rather than approximating it
  - Three perturbation buttons (inject `Date.now()`, leak a secret, add a `while` loop) flip the card red and back for visitors who do not type
  - Proof card carries four lenses: Properties, Trade, Handover, Caller view
  - Added a `Playground` nav link and a `Try it live` hero CTA
  - `main.ts`: added `wasm-unsafe-eval` to the script-src CSP and an `application/wasm` content type
- Primary metric: a first-time visitor sees the proof flip without installing anything
- Leading indicators: visitors trigger a perturbation; scroll depth reaches the playground
- Guardrails: the hero keeps its instant static mockup; the playground lazy-loads its wasm on scroll; the section degrades to a pre-rendered card without JS or WebAssembly
- Frontier note: the playground closes the gap the Iteration 1 note named. A dedicated docs site is the remaining frontier.
