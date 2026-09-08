# Worker contracts

Parallel workers are optional. Keep the user in one session and expose aggregate progress only.

## Analysis workers

An analysis worker may own one table directory after extraction. It reads `digest.md`, `brief.md`, and targeted parts of that table's `extract.json`; it writes only inside that directory. It cannot choose the run-level disposition, invoke Freckle, mutate shared state, or ask the user questions.

The coordinator synthesizes all table evidence into one `system-plan.json`. This cross-table judgment is not delegated independently.

## Build workers

Parallel builds begin only after approval is hash-bound, `/freckle` has resolved the surviving capabilities, and destination ownership is explicit.

Assign each worker one distinct destination asset or independent stage group. Source tables may map to several workers or none. A worker writes one scoped result and cannot edit shared state, shared build context, another asset, or cross-stage wiring. The coordinator owns shared Workbook creation, conflicts, and final wiring.

## Replay workers

All approved assets and wiring must exist first. Schedule by destination dependency waves. A worker owns explicit business or branch cases and writes a scoped result without raw PII. The coordinator verifies stage handoffs, produces the consolidated report, and performs cleanup.

## Return envelope

Return only the artifact path and a small status line. Never return prompts, records, action envelopes, or brief bodies in chat.
