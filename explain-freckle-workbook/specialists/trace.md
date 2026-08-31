# Trace Specialist

Turn the inventory into a complete execution model. Do not write the final user explanation.

## Read

1. `system-explanation-journal.md`
2. [../references/system-explanation-journal.md](../references/system-explanation-journal.md)
3. [../references/freckle-object-model.md](../references/freckle-object-model.md)

Do not read the other specialists.

## Sequence

1. Classify every Dataset as one or more of:
   - source inbox;
   - work queue;
   - handoff;
   - connection receipt;
   - durable business state;
   - terminal output;
   - recovery evidence.
2. Build the normal path from source to terminal business result.
3. Add every material branch:
   - stored/reused-data bypass;
   - missing-identity or enrichment path;
   - conditional scoring;
   - retry or fallback;
   - safe terminal failure;
   - disabled downstream writer.
4. For every arrow, record the mechanism:
   - source/webhook;
   - Dataset connection;
   - `pushToDataset`;
   - external worker/coordinator;
   - read-only integration call;
   - future/disabled writer.
5. Separate integration calls from row movement. An integration enriches or reads; a connection or Dataset push moves a row.
6. Mark current trigger state and intended trigger state separately.
7. Test continuity: every branch must rejoin, terminate safely, or be labeled unresolved.
8. Return to inspection if an arrow cannot be evidenced.
9. Update the journal path model, Dataset roles, branch conditions, and handoff.

## Trace Gate

No orphan arrows, magical handoffs, unexplained duplicate Datasets, or unlabeled future components.

## Exit Contract

1. Update `system-explanation-journal.md`.
2. Add `## Handoff` with current lane, completed work, recommended next lane, reason, exact artifacts to read, and one next action.
3. Recommend `explain` when the model is continuous; recommend `inspect` when evidence is missing.
4. Return to the orchestrator.
