FROM apache/airflow:2.9.3-python3.11

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless procps \
    && rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Copy pipeline source so Airflow workers can run it
COPY --chown=airflow:root src/ /opt/airflow/pipeline/src/
COPY --chown=airflow:root pyproject.toml /opt/airflow/pipeline/
COPY --chown=airflow:root conf/ /opt/airflow/pipeline/conf/
COPY --chown=airflow:root README.md /opt/airflow/pipeline/

USER airflow
ENV PYTHONPATH=/opt/airflow/pipeline/src:${PYTHONPATH}
ENV SPARK_LOCAL_IP=127.0.0.1
ENV HOME=/home/airflow

RUN pip install --no-cache-dir \
    "pyspark>=3.5.0,<4.0.0" \
    "delta-spark>=3.2.0,<4.0.0" \
    "great_expectations>=1.16.0,<2.0.0" \
    "PyYAML>=6.0.1" \
    && pip install --no-cache-dir -e /opt/airflow/pipeline/ --no-deps
