# Implementation Plan

## Slice 1: Expert Agent Section (HTML + CSS)
- Files: static/index.html, static/style.css
- Add new section between Code (#code) and Modules (#modules)
- HTML: section with id="expert", section-title, 1-2 sentence description, terminal block
- CSS: styles for the expert section layout
- Dependencies: none
- Estimated complexity: low

## Slice 2: Design Polish Pass
- Files: static/index.html, static/style.css, static/script.js
- Review and fix identified rough edges
- Dependencies: Slice 1 (polish the expert section too)
- Estimated complexity: medium

## Integration
- Order: Slice 1 then Slice 2
- Verification: start dev server, visual review in browser
