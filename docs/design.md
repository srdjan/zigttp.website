# zts Expert Section + Design Polish

## Problem Statement

The zttp website's redesign consolidated the "Compiler-in-the-Loop for Claude"
feature into a single sentence of prose. The zts expert agent is a
differentiating capability: Claude Code gets native tool-use access to the zttp
compiler, enabling an automated write-verify-fix loop that produces
proven-correct handlers. This deserves a dedicated section with a visual demo,
not a buried mention.

Additionally, the fresh redesign needs a polish pass to catch rough edges in
typography, spacing, motion, and responsiveness.

## Success Metrics

- Primary: visitor understands the agent-compiler feedback loop within 10
  seconds of scrolling to the section
- Leading: the terminal demo is visually compelling enough to pause scrolling
- Guardrail: section does not break the concise editorial feel established in
  the redesign

## Goals

1. Add a zts expert coding agent section between Code and Modules (position 4
   of 6)
2. Show an agent workflow demo via a terminal that depicts the full loop
3. Identify and fix design rough edges across the entire page

## Non-Goals

- Interactive/animated terminal typing effect (static terminal is sufficient)
- Separate page for the expert feature
- Documentation-level detail about the expert API

## Section Design

### Content

One section title, one brief description (1-2 sentences), one terminal showing:

```
$ zttp expert "add a health check endpoint"

[agent] Writing handler...
[agent] Compiling handler.ts

  error[E0003]: try/catch is not supported in zts
    --> handler.ts:12:5
    = help: use Result types

[agent] Rewriting with Result types...
[agent] Compiling handler.ts

  PROVEN 7/7 proofs
  Handler ready: health-check (1.2MB)
```

### Visual Treatment

- Full-width terminal (same aesthetic as the workflow terminal in Get Started)
- The section should feel different from the Pitch terminal - more dramatic,
  showing a conversation not a command
- Consider a two-column layout: brief prose left, terminal right (mirrors Pitch
  but inverted emphasis)

## Design Polish Items (to identify during implementation)

Review and fix:

- Hero viewport sizing and terminal positioning
- Pitch section prose readability and spacing
- Code tabs border-left layout shift potential
- Module grid column widths at various breakpoints
- Section dark gradient transitions with new near-black palette
- FAQ/Get Started density
- Overall typographic rhythm and vertical spacing
- Any orphaned or conflicting CSS rules
