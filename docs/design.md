# Lean Homepage Design

## Goal

A skeptical TypeScript developer should understand zttp within one screen, break
a proof in the browser, and know how to install the CLI.

## Content Architecture

The homepage has five content sections:

1. Hero: the product claim, one action, one install command, and one veto
   transcript.
2. Live proof: the real WebAssembly analyzer and its proof card.
3. One write path: four steps from draft to proven write.
4. Evidence: three evidence grades and a compact runtime proof carrier.
5. Install: one command, the first three CLI steps, and two links.

The header contains Try, Docs, GitHub, and Install. The footer contains GitHub,
Docs, Releases, and Strategy.

## Information Depth

The visible page carries the product decision, workflow, evidence grade, and
first action. Technical depth uses native `details` elements:

- Why zts restricts TypeScript
- Comparison with bolt-on checkers
- Full claim ledger
- Runtime and workflow documentation

Release policy, the complete CLI reference, detailed workflows, hypermedia
examples, and product refusals belong in repository documentation.

## Visual Direction

The live proof is the page's main interactive surface. Graphite marks compiler
output, cream carries editorial copy, red marks a veto, and green marks a proven
write. Ordinary sections use tighter spacing than the hero and playground.

The signature is one red draft moving through the compiler gate and ending
green. Supporting sections use borders and restrained surface changes so they do
not compete with the playground.

## Interaction Contract

The page works without JavaScript. The playground ships a read-only editor and
pre-rendered proof card. JavaScript upgrades it to the live analyzer, adds
syntax highlighting, and enables perturbation controls.

Technical disclosures use native `details` and `summary`. The mobile menu is the
only drawer-like interaction.

## Success Checks

- The hero explains the product without relying on the terminal.
- Section headings alone tell the complete story.
- The playground remains usable at desktop and mobile widths.
- A visitor can reach installation from the header, hero, or closing section.
- Hidden detail remains keyboard accessible and useful without JavaScript.
