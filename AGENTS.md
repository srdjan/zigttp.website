# AGENTS.md

Marketing site for zttp - a restricted-TypeScript ("zts") toolchain with a
compiler-in-the-loop coding agent. Deno-served static assets, no build step, no
framework.

**The canonical guidance is `CLAUDE.md`. Read it before changing anything.** It
carries the stack, the layout, the conventions, the routing rules, and what is
out of scope. This file is a pointer on purpose: two copies of the same rules
drifted apart once already and told Claude and Codex to do different things.

Two rules are repeated here because they bind every session, whichever agent is
driving:

- **Verify with one command.** `deno task verify` runs format, lint, typecheck,
  and tests. Run it before committing. CI runs the same command, and
  `deno task deploy` is gated behind it.
- **Always tear down after testing.** When a session starts the server or drives
  a browser, kill the server process, close the browser, and confirm the port is
  free (`lsof -nP -iTCP:8000 -sTCP:LISTEN`) before reporting the work done.
  Never leave `:8000` bound or a browser session open between turns.
