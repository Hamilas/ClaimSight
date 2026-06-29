"""Healthcare Medallion DAG — Docker-aware entry point.

Uses PIPELINE_CONFIG env var so the config path is explicit
regardless of where Airflow places this file inside the container.
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from airflow import DAG
from airflow.operators.python import PythonOperator

from healthcare_medallion.pipeline import run_pipeline

_CONFIG_PATH = Path(
    os.environ.get(
        "PIPELINE_CONFIG",
        "/opt/airflow/pipeline/conf/pipeline.yml",
    )
)


def _run_layer(layer: str) -> None:
    run_pipeline(layer=layer, config_path=_CONFIG_PATH)


with DAG(
    dag_id="healthcare_medallion_pipeline",
    description="Healthcare medallion batch pipeline — Bronze → Silver → Gold.",
    schedule="0 6 * * *",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["healthcare", "medallion", "delta", "claimsight"],
) as dag:
    bronze = PythonOperator(
        task_id="bronze_ingestion",
        python_callable=_run_layer,
        op_kwargs={"layer": "bronze"},
    )
    silver = PythonOperator(
        task_id="silver_transformations",
        python_callable=_run_layer,
        op_kwargs={"layer": "silver"},
    )
    gold = PythonOperator(
        task_id="gold_serving",
        python_callable=_run_layer,
        op_kwargs={"layer": "gold"},
    )

    bronze >> silver >> gold
