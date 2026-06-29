# ClaimSight — Data Lineage

Author: Rayen Lassoued | github.com/Hamilas

This document tracks field-level data lineage from raw CSV sources through
Bronze, Silver, and Gold Delta Lake layers.

---

## Source Files (data/raw/)

| File | Rows (sample) | Key Fields |
|------|-------------|------------|
| `claims_sample.csv` | 6 | claim_id, member_id, provider_id, service_date, diagnosis_code, procedure_code, billed_amount, paid_amount, claim_status |
| `members_sample.csv` | N | member_id, full_name, date_of_birth, gender, city, state, plan_id |
| `providers_sample.csv` | N | provider_id, provider_name, specialty, npi, city, state |

---

## Bronze Layer (data/bronze/)

**Purpose**: Land raw data into Delta tables with ingestion metadata. No business transformations.

### bronze/claims

| Output Column | Source | Transformation |
|---|---|---|
| claim_id | claims.csv → claim_id | None (as-is string) |
| member_id | claims.csv → member_id | None |
| provider_id | claims.csv → provider_id | None |
| service_date | claims.csv → service_date | None (raw string) |
| diagnosis_code | claims.csv → diagnosis_code | None |
| procedure_code | claims.csv → procedure_code | None |
| billed_amount | claims.csv → billed_amount | None (raw string) |
| paid_amount | claims.csv → paid_amount | None (raw string) |
| claim_status | claims.csv → claim_status | None (raw, mixed case) |
| source_file | Ingestion metadata | Filename of CSV at ingest time |
| record_hash | Computed | SHA-256 of all raw field values |
| ingested_at | Ingestion metadata | UTC timestamp when row was ingested |
| record_source | Ingestion metadata | Constant: "claims" |

**Merge key**: `claim_id` — existing rows updated if hash changes (late arrivals).

### bronze/members

| Output Column | Source | Transformation |
|---|---|---|
| member_id | members.csv → member_id | None |
| full_name | members.csv → full_name | None |
| date_of_birth | members.csv → date_of_birth | None (raw string) |
| gender | members.csv → gender | None |
| city | members.csv → city | None |
| state | members.csv → state | None (raw, may be mixed case) |
| plan_id | members.csv → plan_id | None |
| source_file, record_hash, ingested_at, record_source | Ingestion metadata | Same as claims |

**Merge key**: `member_id`

### bronze/providers

| Output Column | Source | Transformation |
|---|---|---|
| provider_id | providers.csv → provider_id | None |
| provider_name | providers.csv → provider_name | None |
| specialty | providers.csv → specialty | None |
| npi | providers.csv → npi | None |
| city | providers.csv → city | None |
| state | providers.csv → state | None |
| source_file, record_hash, ingested_at, record_source | Ingestion metadata | Same as claims |

**Merge key**: `provider_id`

---

## Silver Layer (data/silver/)

**Purpose**: Standardize, enrich, and join claims with dimension data. Apply business rules.

### silver/member_claims

| Output Column | Source | Transformation |
|---|---|---|
| claim_id | bronze/claims → claim_id | None |
| member_id | bronze/claims → member_id | None |
| member_name | bronze/members → full_name | LEFT JOIN on member_id |
| date_of_birth | bronze/members → date_of_birth | `CAST AS DATE` |
| gender | bronze/members → gender | None |
| member_city | bronze/members → city | `INITCAP(TRIM(...))` |
| member_state | bronze/members → state | `UPPER(TRIM(...))` |
| plan_id | bronze/members → plan_id | None |
| provider_id | bronze/claims → provider_id | None |
| provider_name | bronze/providers → provider_name | LEFT JOIN on provider_id |
| provider_specialty | bronze/providers → specialty | `INITCAP(TRIM(...))` |
| npi | bronze/providers → npi | None |
| provider_city | bronze/providers → city | `INITCAP(TRIM(...))` |
| provider_state | bronze/providers → state | `UPPER(TRIM(...))` |
| service_date | bronze/claims → service_date | `CAST AS DATE` |
| claim_month | service_date | `DATE_TRUNC('month', service_date)` |
| diagnosis_code | bronze/claims → diagnosis_code | None |
| procedure_code | bronze/claims → procedure_code | None |
| claim_status | bronze/claims → claim_status | `UPPER(TRIM(...))` → PAID/DENIED/PENDING |
| billed_amount | bronze/claims → billed_amount | `CAST AS DOUBLE` |
| paid_amount | bronze/claims → paid_amount | `CAST AS DOUBLE` |
| patient_responsibility | billed_amount, paid_amount | `ROUND(billed - paid, 2)` |
| is_high_cost_claim | paid_amount | `TRUE if paid_amount >= 200.00` |
| source_file | bronze/claims → source_file | None |
| ingested_at | bronze/claims → ingested_at | None |
| last_touched_at | ingested_at (claims + members + providers) | `GREATEST(c.ingested_at, m.ingested_at, p.ingested_at)` |
| record_source | bronze/claims → record_source | None |

**Filters applied**:
- `claim_id IS NOT NULL`
- `member_id IS NOT NULL`
- `provider_id IS NOT NULL`
- `paid_amount IS NOT NULL AND paid_amount >= 0`

**Merge key**: `claim_id`

### silver/claim_quality_metrics

| Output Column | Source | Transformation |
|---|---|---|
| claim_month | silver/member_claims → claim_month | GROUP BY |
| plan_id | silver/member_claims → plan_id | GROUP BY |
| claim_status | silver/member_claims → claim_status | GROUP BY |
| claim_count | All rows in group | `COUNT(*)` |
| total_billed_amount | billed_amount | `ROUND(SUM(...), 2)` |
| total_paid_amount | paid_amount | `ROUND(SUM(...), 2)` |
| average_patient_responsibility | patient_responsibility | `ROUND(AVG(...), 2)` |
| source_max_last_touched_at | last_touched_at | `MAX(...)` |

---

## Gold Layer (data/gold/)

**Purpose**: Business-ready aggregates for reporting and BI tools.

### gold/monthly_cost_by_plan_state

| Output Column | Source | Transformation |
|---|---|---|
| claim_month | silver/member_claims → claim_month | GROUP BY |
| plan_id | silver/member_claims → plan_id | GROUP BY |
| member_state | silver/member_claims → member_state | GROUP BY |
| total_claims | claim_id | `COUNT(*)` |
| distinct_members | member_id | `COUNT(DISTINCT member_id)` |
| distinct_providers | provider_id | `COUNT(DISTINCT provider_id)` |
| total_billed_amount | billed_amount | `ROUND(SUM(...), 2)` |
| total_paid_amount | paid_amount | `ROUND(SUM(...), 2)` |
| average_paid_amount | paid_amount | `ROUND(AVG(...), 2)` |
| paid_to_billed_ratio | total_paid / total_billed | `ROUND(paid / billed, 4)` with zero guard |
| source_max_last_touched_at | last_touched_at | `MAX(...)` |

### gold/provider_specialty_summary

| Output Column | Source | Transformation |
|---|---|---|
| claim_month | silver/member_claims → claim_month | GROUP BY |
| provider_specialty | silver/member_claims → provider_specialty | GROUP BY |
| provider_state | silver/member_claims → provider_state | GROUP BY |
| total_claims | claim_id | `COUNT(*)` |
| distinct_providers | provider_id | `COUNT(DISTINCT provider_id)` |
| distinct_members | member_id | `COUNT(DISTINCT member_id)` |
| total_paid_amount | paid_amount | `ROUND(SUM(...), 2)` |
| average_patient_responsibility | patient_responsibility | `ROUND(AVG(...), 2)` |
| high_cost_claim_count | is_high_cost_claim | `SUM(CASE WHEN is_high_cost_claim THEN 1 ELSE 0 END)` |
| source_max_last_touched_at | last_touched_at | `MAX(...)` |

---

## Fraud Detection Layer (sql/fraud_detection.sql)

**Input**: silver/member_claims
**Output**: fraud summary report (not persisted as Delta — intended for ad-hoc or scheduled reporting)

| Flag Type | Detection Logic |
|---|---|
| `DUPLICATE_CLAIM_7D` | Window: `COUNT(*) OVER (PARTITION BY member_id, procedure_code ORDER BY service_date RANGE 6 DAYS PRECEDING)` > 1 |
| `HIGH_VOLUME_PROVIDER_DAY` | Window: `COUNT(*) OVER (PARTITION BY provider_id, service_date)` >= 10 |
| `AMOUNT_ANOMALY_3SIGMA` | Billed amount >= `AVG(billed) + 3 * STDDEV_POP(billed)` grouped by specialty |

---

## Pipeline Metrics (src/healthcare_medallion/monitoring/pipeline_metrics.py)

**Output files** (written to `data/system/metrics/`):

| File | Content |
|---|---|
| `run_{timestamp}_{layer}.json` | Full run metrics with per-stage breakdown |
| `latest_run.json` | Overwritten each run — current state |
| `run_history.jsonl` | Newline-delimited JSON — one line per run for trend analysis |

**Tracked metrics per stage**:
- `records_in` / `records_out` / `records_dropped`
- `duration_seconds`
- `error_count` and `errors[]`
- `status`: pending | running | success | failed
