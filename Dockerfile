FROM python:3.12-alpine

WORKDIR /app

# Copy application & PWA files (zero external pip installs)
COPY index.html server.py manifest.json icon.svg sw.js ./
COPY src ./src

RUN mkdir -p /data

ENV PORT=8765 \
    BLITZ_HOST=0.0.0.0 \
    BLITZ_DATA_DIR=/data \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8765
VOLUME ["/data"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8765\")}/health', timeout=2)" || exit 1

CMD ["python", "-u", "server.py"]
