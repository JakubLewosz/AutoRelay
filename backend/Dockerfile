FROM python:3.12.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN addgroup --system autorelay && adduser --system --ingroup autorelay autorelay

COPY pyproject.toml alembic.ini ./
COPY alembic ./alembic
COPY app ./app

RUN python -m pip install --no-cache-dir .

USER autorelay

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log"]
