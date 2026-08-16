# python:3.13-slim-trixie — system OpenSSL 3.5.6 (verified 2026-08-16).
# 3.13 not 3.14: asyncpg has no cp314 wheel yet and the slim image has no gcc.
FROM python:3.13-slim-trixie@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY sensors.py tls_state.py app.py entrypoint.sh ./
RUN chmod +x entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
