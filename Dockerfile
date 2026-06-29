FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SPARK_LOCAL_IP=127.0.0.1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64

WORKDIR /app

# Install Java (required for Spark) in a single layer
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openjdk-21-jre-headless \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy source first (needed for editable install)
COPY pyproject.toml README.md ./
COPY src ./src

# Install Python dependencies
RUN python -m pip install --upgrade pip \
    && python -m pip install -e .[dev]

# Copy remaining project files
COPY conf ./conf
COPY data ./data
COPY docs ./docs
COPY orchestration ./orchestration
COPY sql ./sql
COPY tests ./tests

# Create non-root user with home dir for Spark/Ivy cache
RUN useradd --create-home --shell /bin/bash --uid 1001 pipeline \
    && mkdir -p /home/pipeline/.ivy2/cache /home/pipeline/.ivy2/jars \
    && chown -R pipeline:pipeline /app /home/pipeline

USER pipeline

CMD ["python", "-m", "healthcare_medallion.pipeline", "--layer", "all"]
