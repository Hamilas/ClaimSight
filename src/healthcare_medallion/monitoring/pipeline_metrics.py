"""Pipeline metrics module for ClaimSight.

Tracks per-stage metrics (records processed, error counts, duration)
and writes JSON logs for observability.

Author: Rayen Lassoued | github.com/Hamilas
"""
from __future__ import annotations

import json
import logging
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator

LOGGER = logging.getLogger(__name__)


@dataclass
class StageMetrics:
    """Metrics for a single pipeline stage (bronze, silver, gold)."""

    stage: str
    run_id: str
    started_at: str = ""
    finished_at: str = ""
    duration_seconds: float = 0.0
    records_in: int = 0
    records_out: int = 0
    records_dropped: int = 0
    error_count: int = 0
    status: str = "pending"  # pending | running | success | failed
    errors: list[str] = field(default_factory=list)
    extra: dict[str, object] = field(default_factory=dict)

    def record_error(self, message: str) -> None:
        self.error_count += 1
        self.errors.append(message)

    def set_record_counts(self, records_in: int, records_out: int) -> None:
        self.records_in = records_in
        self.records_out = records_out
        self.records_dropped = max(0, records_in - records_out)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass
class PipelineRun:
    """Aggregated metrics for a complete pipeline run (all stages)."""

    run_id: str
    pipeline_name: str
    layer: str
    started_at: str = ""
    finished_at: str = ""
    total_duration_seconds: float = 0.0
    total_records_processed: int = 0
    total_errors: int = 0
    status: str = "pending"
    stages: list[StageMetrics] = field(default_factory=list)

    def add_stage(self, stage: StageMetrics) -> None:
        self.stages.append(stage)
        self.total_records_processed += stage.records_out
        self.total_errors += stage.error_count

    def to_dict(self) -> dict[str, object]:
        d = asdict(self)
        d["stages"] = [s for s in d["stages"]]
        return d


class MetricsWriter:
    """Writes pipeline run metrics to a JSON log file."""

    def __init__(self, output_dir: str | Path) -> None:
        self._output_dir = Path(output_dir)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    def write(self, run: PipelineRun) -> Path:
        filename = f"{run.run_id}.json"
        output_path = self._output_dir / filename
        payload = run.to_dict()
        output_path.write_text(
            json.dumps(payload, indent=2, default=str),
            encoding="utf-8",
        )
        LOGGER.info("Metrics written to %s", output_path)
        return output_path

    def write_summary(self, run: PipelineRun) -> Path:
        """Overwrite a rolling summary file with the latest run."""
        summary_path = self._output_dir / "latest_run.json"
        summary_path.write_text(
            json.dumps(run.to_dict(), indent=2, default=str),
            encoding="utf-8",
        )
        return summary_path

    def append_to_history(self, run: PipelineRun) -> Path:
        """Append this run's summary to a newline-delimited JSON history log."""
        history_path = self._output_dir / "run_history.jsonl"
        summary = {
            "run_id": run.run_id,
            "layer": run.layer,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "duration_seconds": run.total_duration_seconds,
            "records_processed": run.total_records_processed,
            "errors": run.total_errors,
            "status": run.status,
        }
        with history_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(summary, default=str) + "\n")
        return history_path


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def make_run_id(layer: str) -> str:
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M%S")
    return f"run_{ts}_{layer}"


@contextmanager
def track_stage(
    run: PipelineRun,
    stage_name: str,
) -> Generator[StageMetrics, None, None]:
    """Context manager that times a pipeline stage and records it on the run.

    Usage::

        with track_stage(run, "bronze") as stage:
            bronze_outputs = bronze.run(spark, config)
            stage.set_record_counts(
                records_in=raw_count,
                records_out=bronze_count,
            )
    """
    stage = StageMetrics(stage=stage_name, run_id=run.run_id)
    stage.started_at = _now_iso()
    stage.status = "running"
    start_time = time.perf_counter()

    LOGGER.info("Stage [%s] started.", stage_name)
    try:
        yield stage
        stage.status = "success"
        LOGGER.info(
            "Stage [%s] finished. records_out=%d errors=%d",
            stage_name,
            stage.records_out,
            stage.error_count,
        )
    except Exception as exc:
        stage.status = "failed"
        stage.record_error(str(exc))
        LOGGER.error("Stage [%s] failed: %s", stage_name, exc)
        raise
    finally:
        stage.finished_at = _now_iso()
        stage.duration_seconds = round(time.perf_counter() - start_time, 4)
        run.add_stage(stage)


@contextmanager
def track_run(
    pipeline_name: str,
    layer: str,
    metrics_dir: str | Path,
) -> Generator[PipelineRun, None, None]:
    """Context manager that wraps an entire pipeline run.

    Automatically writes metrics to disk when the run finishes.

    Usage::

        with track_run("healthcare_medallion", "all", "data/system/metrics") as run:
            with track_stage(run, "bronze") as stage:
                ...
    """
    run_id = make_run_id(layer)
    run = PipelineRun(
        run_id=run_id,
        pipeline_name=pipeline_name,
        layer=layer,
    )
    run.started_at = _now_iso()
    run.status = "running"
    start_time = time.perf_counter()

    writer = MetricsWriter(metrics_dir)
    LOGGER.info("Pipeline run [%s] started. run_id=%s", pipeline_name, run_id)

    try:
        yield run
        run.status = "success" if run.total_errors == 0 else "partial_failure"
    except Exception as exc:
        run.status = "failed"
        LOGGER.error("Pipeline run [%s] failed: %s", run_id, exc)
        raise
    finally:
        run.finished_at = _now_iso()
        run.total_duration_seconds = round(time.perf_counter() - start_time, 4)
        writer.write(run)
        writer.write_summary(run)
        writer.append_to_history(run)
        LOGGER.info(
            "Pipeline run [%s] complete. status=%s duration=%.4fs records=%d errors=%d",
            run_id,
            run.status,
            run.total_duration_seconds,
            run.total_records_processed,
            run.total_errors,
        )
