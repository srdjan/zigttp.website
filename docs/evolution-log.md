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
