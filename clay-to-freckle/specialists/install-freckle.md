# Install-Freckle Specialist

Owns: getting the `freckle` CLI installed and authenticated — invoked from the handoff lane only, never at preflight. By the time this lane runs, the user holds a finished, approved brief; setup is the last step between them and their workflow (that ordering is deliberate — do not move this check earlier).

## Read

- `journal/state.json`

## Sequence

1. **Check the CLI.** `command -v freckle`. If present, skip to step 3.
2. **Install.** Tell the user, and follow along: "Install the freckle cli by following the instructions from https://install.freckle.io". Fetch that page and follow its current instructions (do not hard-code an install command here — the page is the source of truth). If installation needs actions only the user can take (account creation, org selection), hand those to the user explicitly.
3. **Check auth.** Run the CLI's own status/whoami command (see `freckle --help` for the current name). If unauthenticated, run its login flow — the user completes any browser-based approval themselves.
4. **Check the /freckle skill.** The freckle skill is managed/installed by the freckle CLI. If it is not yet available after install, tell the orchestrator and record `installed, session restart pending` through a structured state patch.

## Exit Contract

1. Return the install outcome to the orchestrator for an atomic `state.json` update: `verified`, `installed`, `installed, session restart pending`, or `blocked: <what>`.
2. Recommend returning to the handoff lane.
3. Return to the orchestrator lane table.
