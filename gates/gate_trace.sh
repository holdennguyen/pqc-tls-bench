#!/bin/sh
# GATE: one POST /records yields a Jaeger trace with >=3 spans (edge, api, db).
# TODO(claude-code): curl Jaeger API /api/traces?service=api-python&limit=1, assert span count.
echo "GATE_TRACE: TODO"; exit 1
