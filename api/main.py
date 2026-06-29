"""ClaimSight — REST API + Prometheus metrics endpoint."""
from __future__ import annotations

import json
import os
import time
from pathlib import Path

import duckdb
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from prometheus_client import Counter, Gauge, Histogram, generate_latest, CONTENT_TYPE_LATEST

# ── paths ─────────────────────────────────────────────────────────────────────
DATA_ROOT = Path(os.getenv("DATA_ROOT", "/app/data"))
GOLD_MONTHLY  = DATA_ROOT / "gold" / "monthly_cost_by_plan_state"
GOLD_PROVIDER = DATA_ROOT / "gold" / "provider_specialty_summary"
SILVER_CLAIMS = DATA_ROOT / "silver" / "member_claims"
METRICS_DIR   = DATA_ROOT / "system" / "metrics"
QUALITY_DIR   = DATA_ROOT / "system" / "quality"

# ── prometheus metrics ────────────────────────────────────────────────────────
REQUEST_COUNT    = Counter("api_requests_total", "Total API requests", ["endpoint"])
PIPELINE_RECORDS = Gauge("pipeline_records_total", "Records per layer", ["layer"])
PIPELINE_DURATION= Gauge("pipeline_duration_seconds", "Stage duration", ["stage"])
QUALITY_SCORE    = Gauge("quality_checks_passed", "Quality checks passed out of 48")
FRAUD_FLAGS      = Gauge("fraud_flags_total", "Total fraud flags detected")
REQUEST_LATENCY  = Histogram("api_request_duration_seconds", "Request latency", ["endpoint"])

# ── app ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ClaimSight API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── helpers ───────────────────────────────────────────────────────────────────
def _parquet_glob(path: Path) -> str:
    return str(path / "*.parquet")

def _read_parquet(path: Path) -> pd.DataFrame | None:
    if not path.exists():
        return None
    # Support both flat and partitioned (Hive-style) layouts
    files = list(path.rglob("*.parquet"))
    if not files:
        return None
    return pd.read_parquet(path, engine="pyarrow")

def _load_latest_run() -> dict:
    f = METRICS_DIR / "latest_run.json"
    if f.exists():
        return json.loads(f.read_text())
    return {}

def _quality_stats() -> tuple[int, int]:
    """Returns (passed, total) expectation counts across all quality JSON files."""
    if not QUALITY_DIR.exists():
        return 0, 0
    passed = total = 0
    for jf in QUALITY_DIR.rglob("*.json"):
        try:
            d = json.loads(jf.read_text())
            results = d.get("results", [])
            total += len(results)
            passed += sum(1 for r in results if r.get("success", False))
        except Exception:
            pass
    return passed, total


def _quality_passed() -> int:
    return _quality_stats()[0]

# ── routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    REQUEST_COUNT.labels(endpoint="health").inc()
    return {"status": "ok", "service": "claimsight-api", "timestamp": time.time()}

@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    # Refresh gauges from latest run
    run = _load_latest_run()
    if run:
        for stage in ("bronze", "silver", "gold"):
            stage_data = run.get("stages", {}).get(stage, {})
            rec_out = stage_data.get("records_out", 0) or 0
            dur = stage_data.get("duration_seconds", 0) or 0
            PIPELINE_RECORDS.labels(layer=stage).set(rec_out)
            PIPELINE_DURATION.labels(stage=stage).set(dur)
    passed = _quality_passed()
    QUALITY_SCORE.set(passed)
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/api/pipeline/latest")
def pipeline_latest():
    REQUEST_COUNT.labels(endpoint="pipeline_latest").inc()
    run = _load_latest_run()
    # Also load run history
    history = []
    hist_file = METRICS_DIR / "run_history.jsonl"
    if hist_file.exists():
        for line in hist_file.read_text().strip().splitlines()[-20:]:
            try:
                history.append(json.loads(line))
            except Exception:
                pass
    quality_passed, quality_total = _quality_stats()
    return {
        "latest_run": run,
        "history": history[-10:],
        "quality_passed": quality_passed,
        "quality_total": quality_total,
    }

@app.get("/api/gold/monthly-costs")
def monthly_costs():
    REQUEST_COUNT.labels(endpoint="monthly_costs").inc()
    df = _read_parquet(GOLD_MONTHLY)
    if df is None:
        return {"data": [], "message": "No data yet — run the pipeline first"}
    # Convert dates to strings for JSON serialization
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].astype(str)
    return {"data": df.to_dict(orient="records"), "rows": len(df)}

@app.get("/api/gold/providers")
def provider_summary():
    REQUEST_COUNT.labels(endpoint="provider_summary").inc()
    df = _read_parquet(GOLD_PROVIDER)
    if df is None:
        return {"data": [], "message": "No data yet — run the pipeline first"}
    for col in df.select_dtypes(include=["datetime64[ns]", "datetime64[ns, UTC]"]).columns:
        df[col] = df[col].astype(str)
    return {"data": df.to_dict(orient="records"), "rows": len(df)}

@app.get("/api/fraud")
def fraud_flags():
    REQUEST_COUNT.labels(endpoint="fraud").inc()
    silver_files = list(SILVER_CLAIMS.rglob("*.parquet")) if SILVER_CLAIMS.exists() else []
    if not silver_files:
        return {"flags": [], "summary": {}, "message": "No silver data yet — run the pipeline first"}

    con = duckdb.connect()
    parquet_glob = str(SILVER_CLAIMS / "**" / "*.parquet")

    # Fraud pattern 1: duplicate claims — same member + procedure within 7 days
    dup_sql = f"""
        SELECT
            claim_id,
            member_id,
            provider_id,
            service_date,
            procedure_code,
            billed_amount,
            'DUPLICATE_CLAIM' AS fraud_type,
            'HIGH' AS severity
        FROM (
            SELECT *,
                COUNT(*) OVER (
                    PARTITION BY member_id, procedure_code
                    ORDER BY CAST(service_date AS DATE)
                    RANGE BETWEEN INTERVAL 7 DAYS PRECEDING AND CURRENT ROW
                ) AS cnt
            FROM read_parquet('{parquet_glob}')
            WHERE service_date IS NOT NULL
        ) t
        WHERE cnt > 1
        LIMIT 100
    """

    # Fraud pattern 2: high-volume provider (10+ claims in a single day)
    vol_sql = f"""
        SELECT
            c.claim_id,
            c.member_id,
            c.provider_id,
            c.service_date,
            c.procedure_code,
            c.billed_amount,
            'HIGH_VOLUME_PROVIDER' AS fraud_type,
            CASE WHEN daily_count >= 20 THEN 'CRITICAL' ELSE 'HIGH' END AS severity
        FROM read_parquet('{parquet_glob}') c
        JOIN (
            SELECT provider_id, service_date, COUNT(*) AS daily_count
            FROM read_parquet('{parquet_glob}')
            GROUP BY provider_id, service_date
            HAVING COUNT(*) >= 10
        ) v ON c.provider_id = v.provider_id AND c.service_date = v.service_date
        LIMIT 100
    """

    flags = []
    summary = {"DUPLICATE_CLAIM": 0, "HIGH_VOLUME_PROVIDER": 0, "AMOUNT_ANOMALY": 0}

    for sql, key in [(dup_sql, "DUPLICATE_CLAIM"), (vol_sql, "HIGH_VOLUME_PROVIDER")]:
        try:
            rows = con.execute(sql).fetchdf().to_dict(orient="records")
            for r in rows:
                for k, v in r.items():
                    if hasattr(v, "item"):
                        r[k] = v.item()
            flags.extend(rows)
            summary[key] = len(rows)
        except Exception:
            pass

    # Fraud pattern 3: amount anomaly (>3 sigma per specialty)
    anomaly_sql = f"""
        SELECT
            claim_id,
            member_id,
            provider_id,
            service_date,
            procedure_code,
            billed_amount,
            'AMOUNT_ANOMALY' AS fraud_type,
            'MEDIUM' AS severity
        FROM (
            SELECT *,
                AVG(billed_amount) OVER (PARTITION BY provider_specialty) AS avg_amt,
                STDDEV(billed_amount) OVER (PARTITION BY provider_specialty) AS std_amt
            FROM read_parquet('{parquet_glob}')
        ) t
        WHERE std_amt > 0 AND billed_amount > avg_amt + 3 * std_amt
        LIMIT 50
    """
    try:
        rows = con.execute(anomaly_sql).fetchdf().to_dict(orient="records")
        for r in rows:
            for k, v in r.items():
                if hasattr(v, "item"):
                    r[k] = v.item()
        flags.extend(rows)
        summary["AMOUNT_ANOMALY"] = len(rows)
    except Exception:
        pass

    con.close()
    total = sum(summary.values())
    FRAUD_FLAGS.set(total)
    return {"flags": flags[:200], "summary": summary, "total": total}

@app.get("/api/stats")
def stats():
    REQUEST_COUNT.labels(endpoint="stats").inc()
    run = _load_latest_run()
    quality_passed, quality_total = _quality_stats()
    silver_df = _read_parquet(SILVER_CLAIMS)
    total_claims = int(len(silver_df)) if silver_df is not None else 0
    total_paid = float(silver_df["paid_amount"].sum()) if silver_df is not None and "paid_amount" in silver_df.columns else 0.0
    return {
        "total_claims_processed": total_claims,
        "total_paid_amount": round(total_paid, 2),
        "quality_score": f"{quality_passed}/{quality_total}",
        "last_run": run.get("started_at", "Never"),
        "pipeline_status": run.get("status", "not_run"),
    }
