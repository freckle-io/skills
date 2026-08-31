# Read-Only Database Inspection

Use this reference for every live inspection performed by `explain-freckle-system`.

## Contents

1. Connection and non-negotiable boundaries
2. Relevant v2 tables
3. Target and tenant resolution
4. Schema verification
5. Workbook topology
6. Workflow structure and integrations
7. Activation and recent health
8. Safe outcome sampling
9. Failure handling

## 1. Connection And Non-Negotiable Boundaries

Load the `db-query` skill first. Connect with:

```bash
psql "${FRECKLE_READONLY_POSTGRES_URL}?sslmode=require"
```

Rules:

- Run `SELECT` queries only.
- Never call the `freckle` CLI or Freckle product APIs.
- Never fall back to the CLI when the database or VPN is unavailable.
- Include the resolved `customer_id` in every tenant-scoped query and join.
- Add `LIMIT` to exploratory and row-level queries.
- Prefer keyset or time-bounded queries over `OFFSET`.
- Never query `integration_credential_store`, plaintext/encrypted secret tables, `api_keys`, or other credential-bearing tables.
- Never select full `dataset_sources.config`, `workflow_dataset_connections.input_mapping`, `workflow_revisions.draft`, `compiled_workflow`, `workflow_runs.workflow_inputs`, projection `view` JSON, or raw source `dataset_entries.value`.
- Never inspect raw webhook payload rows merely to explain topology.
- Project exact safe scalar fields or JSON keys only.

If the connection fails with a timeout, refusal, or unreachable host, ask the user to confirm OpenVPN Connect is running. Record the live-database inspection as blocked; do not use the CLI as a substitute.

## 2. Relevant V2 Tables

| Table | Purpose |
|---|---|
| `customer` | Organization/tenant identity |
| `workbooks` | Workbook metadata |
| `datasets` | Dataset metadata and field catalogs |
| `dataset_sources` | Source kinds and ingress ownership |
| `workflow_dataset_connections` | Input Dataset → Workflow → output Dataset wiring and trigger policy |
| `workflows` | Saved Workflow metadata and latest revision pointer |
| `workflow_revisions` | Immutable Workflow structure |
| `dataset_entry_runs` | Per-entry connection execution ledger |
| `workflow_runs` | Base Workflow Run identity and revision |
| `workflow_run_views` | Current run-status projection table |
| `workflow_node_run_views` | Current node-status projection table |
| `dataset_entries` | Dataset rows and lineage; inspect only selected safe outputs |

The `*_views` names are ordinary projection tables, not SQL views.

## 3. Target And Tenant Resolution

For a Workbook URL or ID:

```sql
SELECT
  w.id,
  w.customer_id,
  w.label,
  w.description,
  w.archived_at,
  w.created_at,
  w.updated_at
FROM workbooks w
WHERE w.id = '<workbook-uuid>'::uuid
LIMIT 1;
```

For a saved Workflow URL or ID:

```sql
SELECT
  w.id,
  w.customer_id,
  w.label,
  w.description,
  w.latest_revision_id,
  w.latest_revision_number,
  w.archived_at
FROM workflows w
WHERE w.id = '<workflow-uuid>'::uuid
LIMIT 1;
```

Stop if the target does not resolve exactly once. Copy the resulting `customer_id` into every later predicate; do not rely on shared application state.

## 4. Schema Verification

Before using unfamiliar columns, verify them:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'workbooks',
    'datasets',
    'dataset_sources',
    'workflow_dataset_connections',
    'workflows',
    'workflow_revisions',
    'dataset_entry_runs',
    'workflow_runs',
    'workflow_run_views',
    'workflow_node_run_views',
    'dataset_entries'
  )
ORDER BY table_name, ordinal_position;
```

Check indexes for any table used in a large or time-bounded query:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = '<table-name>';
```

## 5. Workbook Topology

Get safe counts and trigger-policy totals:

```sql
SELECT
  w.id,
  w.customer_id,
  w.label,
  COUNT(DISTINCT d.id) AS dataset_count,
  COUNT(DISTINCT c.id) AS connection_count,
  COUNT(DISTINCT c.workflow_id) AS attached_workflow_count,
  COUNT(DISTINCT c.id) FILTER (WHERE c.trigger_policy = 'auto') AS automatic_connections,
  COUNT(DISTINCT c.id) FILTER (WHERE c.trigger_policy = 'manual') AS manual_connections
FROM workbooks w
LEFT JOIN datasets d
  ON d.workbook_id = w.id
 AND d.customer_id = w.customer_id
LEFT JOIN workflow_dataset_connections c
  ON c.workbook_id = w.id
 AND c.customer_id = w.customer_id
WHERE w.id = '<workbook-uuid>'::uuid
  AND w.customer_id = '<customer-id>'
GROUP BY w.id, w.customer_id, w.label
LIMIT 1;
```

Inventory Datasets and source kinds without selecting source configs:

```sql
SELECT
  d.id,
  d.label,
  d.description,
  d.archived_at,
  COALESCE(array_agg(DISTINCT s.kind) FILTER (WHERE s.kind IS NOT NULL), '{}') AS source_kinds
FROM datasets d
LEFT JOIN dataset_sources s
  ON s.dataset_id = d.id
 AND s.customer_id = d.customer_id
WHERE d.workbook_id = '<workbook-uuid>'::uuid
  AND d.customer_id = '<customer-id>'
GROUP BY d.id, d.label, d.description, d.archived_at
ORDER BY d.created_at
LIMIT 500;
```

Resolve the complete connection graph without selecting mappings or constants:

```sql
SELECT
  c.id,
  c.trigger_policy,
  c.auto_admission_after,
  input_d.id AS input_dataset_id,
  input_d.label AS input_dataset,
  w.id AS workflow_id,
  w.label AS workflow,
  output_d.id AS output_dataset_id,
  output_d.label AS output_dataset
FROM workflow_dataset_connections c
JOIN datasets input_d
  ON input_d.id = c.input_dataset_id
 AND input_d.customer_id = c.customer_id
JOIN workflows w
  ON w.id = c.workflow_id
 AND w.customer_id = c.customer_id
JOIN datasets output_d
  ON output_d.id = c.output_dataset_id
 AND output_d.customer_id = c.customer_id
WHERE c.workbook_id = '<workbook-uuid>'::uuid
  AND c.customer_id = '<customer-id>'
ORDER BY c.created_at
LIMIT 500;
```

The inspection gate fails if any connection cannot resolve all three attached objects.

## 6. Workflow Structure And Integrations

Inspect attached Workflow metadata and current revision pointers:

```sql
SELECT DISTINCT
  w.id,
  w.label,
  w.description,
  w.latest_revision_id,
  w.latest_revision_number,
  w.archived_at,
  wr.shape
FROM workflow_dataset_connections c
JOIN workflows w
  ON w.id = c.workflow_id
 AND w.customer_id = c.customer_id
LEFT JOIN workflow_revisions wr
  ON wr.id = w.latest_revision_id
 AND wr.customer_id = w.customer_id
WHERE c.workbook_id = '<workbook-uuid>'::uuid
  AND c.customer_id = '<customer-id>'
ORDER BY w.label
LIMIT 500;
```

Project node families without exposing node configuration or bindings:

```sql
WITH attached AS (
  SELECT DISTINCT c.workflow_id, c.customer_id
  FROM workflow_dataset_connections c
  WHERE c.workbook_id = '<workbook-uuid>'::uuid
    AND c.customer_id = '<customer-id>'
),
latest AS (
  SELECT w.id, w.label, w.customer_id, wr.draft
  FROM attached a
  JOIN workflows w
    ON w.id = a.workflow_id
   AND w.customer_id = a.customer_id
  JOIN workflow_revisions wr
    ON wr.id = w.latest_revision_id
   AND wr.customer_id = w.customer_id
)
SELECT
  latest.id AS workflow_id,
  latest.label AS workflow,
  node.value->>'uses' AS definition_key,
  COUNT(*) AS node_count
FROM latest
CROSS JOIN LATERAL jsonb_each(latest.draft->'nodes') AS node
WHERE node.value ? 'uses'
GROUP BY latest.id, latest.label, node.value->>'uses'
ORDER BY latest.label, definition_key
LIMIT 1000;
```

For `pushToDataset@1.0.0` nodes only, the explicit target Dataset ID is safe structural evidence:

```sql
WITH attached AS (
  SELECT DISTINCT c.workflow_id, c.customer_id
  FROM workflow_dataset_connections c
  WHERE c.workbook_id = '<workbook-uuid>'::uuid
    AND c.customer_id = '<customer-id>'
),
latest AS (
  SELECT w.id, w.label, w.customer_id, wr.draft
  FROM attached a
  JOIN workflows w
    ON w.id = a.workflow_id
   AND w.customer_id = a.customer_id
  JOIN workflow_revisions wr
    ON wr.id = w.latest_revision_id
   AND wr.customer_id = w.customer_id
)
SELECT
  latest.id AS workflow_id,
  latest.label AS workflow,
  node.key AS node_id,
  node.value->'config'->>'datasetId' AS target_dataset_id
FROM latest
CROSS JOIN LATERAL jsonb_each(latest.draft->'nodes') AS node
WHERE node.value->>'uses' = 'pushToDataset@1.0.0'
LIMIT 500;
```

Do not generalize this exception to other config fields. Never select whole node objects, `config`, `with`, full drafts, or compiled Workflows.

## 7. Activation And Recent Health

Trigger policy proves automatic versus manual admission. Recent runs prove whether the path has actually received work.

Summarize recent per-connection activity:

```sql
SELECT
  c.id AS connection_id,
  input_d.label AS input_dataset,
  w.label AS workflow,
  c.trigger_policy,
  recent.status,
  recent.created_at AS latest_entry_run_at
FROM workflow_dataset_connections c
JOIN datasets input_d
  ON input_d.id = c.input_dataset_id
 AND input_d.customer_id = c.customer_id
JOIN workflows w
  ON w.id = c.workflow_id
 AND w.customer_id = c.customer_id
LEFT JOIN LATERAL (
  SELECT der.status, der.created_at
  FROM dataset_entry_runs der
  WHERE der.connection_id = c.id
    AND der.customer_id = c.customer_id
  ORDER BY der.created_at DESC
  LIMIT 1
) recent ON true
WHERE c.workbook_id = '<workbook-uuid>'::uuid
  AND c.customer_id = '<customer-id>'
ORDER BY recent.created_at DESC NULLS LAST
LIMIT 500;
```

Inspect recent Workflow status without selecting inputs or projection JSON:

```sql
SELECT
  rv.run_id,
  rv.workflow_id,
  w.label AS workflow,
  rv.status,
  rv.created_at,
  rv.updated_at
FROM workflow_run_views rv
JOIN workflows w
  ON w.id = rv.workflow_id
 AND w.customer_id = rv.customer_id
WHERE rv.customer_id = '<customer-id>'
  AND rv.workflow_id IN (
    SELECT DISTINCT c.workflow_id
    FROM workflow_dataset_connections c
    WHERE c.workbook_id = '<workbook-uuid>'::uuid
      AND c.customer_id = '<customer-id>'
  )
ORDER BY rv.created_at DESC
LIMIT 100;
```

When a failure matters, inspect only exact safe error fields whose keys have first been discovered. Do not display raw error JSON, node views, payloads, or Workflow inputs.

Projection tables can lag base tables. Compare `updated_at` timestamps with `workflow_runs` or `dataset_entry_runs` before treating a missing projection row as proof that nothing ran.

## 8. Safe Outcome Sampling

Sample output rows only when activation or writer behavior cannot be established from topology and run status.

1. Resolve the exact terminal output Dataset.
2. Inspect field names from `datasets.field_catalog` or sampled JSON keys.
3. Select only approved business-safe scalar fields needed to prove the outcome.
4. Include `customer_id`, exact `dataset_id`, an order, and a small `LIMIT`.

Never select `value` wholesale. Never sample a raw source inbox for explanation work.

Example field-key discovery:

```sql
SELECT DISTINCT key
FROM dataset_entries e
CROSS JOIN LATERAL jsonb_object_keys(e.value) AS key
WHERE e.customer_id = '<customer-id>'
  AND e.dataset_id = '<terminal-dataset-uuid>'::uuid
ORDER BY key
LIMIT 100;
```

After approving exact keys, project them explicitly:

```sql
SELECT
  e.id,
  e.created_at,
  e.value->>'status' AS status,
  e.value->>'action' AS action
FROM dataset_entries e
WHERE e.customer_id = '<customer-id>'
  AND e.dataset_id = '<terminal-dataset-uuid>'::uuid
ORDER BY e.id DESC
LIMIT 10;
```

Replace the example keys with fields proven to exist and safe to expose.

## 9. Failure Handling

- If a query times out, narrow it by `customer_id`, Workbook/Workflow ID, connection ID, and time or UUID range.
- If it still times out, record the failed query shape without credentials and ask the user to forward it to Freckle engineering.
- If the database connection fails, ask the user to check OpenVPN Connect.
- If a required fact lives only in a secret-bearing field, record it as unknown. Do not retrieve the value.
- Never repair, retry, invoke, or mutate anything while explaining the system.
