#!/bin/sh
# GATE: one POST /records produces a Jaeger trace with >=3 spans
# (api handler + db + cache from auto-instrumentation).
fail=0
curl -sk -X POST https://localhost:8443/py/records -H 'content-type: application/json' \
  -d '{"patient_name":"Trace Gate","dob":"1990-01-01","diagnosis":"trace check","notes":"synthetic"}' >/dev/null
sleep 4  # batch processor flush + jaeger ingest

for svc in api-python-hybrid api-node-hybrid; do
  [ "$svc" = api-node-hybrid ] && curl -sk -X POST https://localhost:8443/node/records \
      -H 'content-type: application/json' \
      -d '{"patient_name":"Trace Gate","dob":"1990-01-01","diagnosis":"trace check","notes":"synthetic"}' >/dev/null \
      && sleep 4
  spans=$(curl -s "http://localhost:16686/api/traces?service=$svc&limit=5" \
    | jq '[.data[].spans | length] | max // 0')
  echo "$svc: max spans in recent traces = $spans"
  [ "$spans" -ge 3 ] || { echo "TRACE FAIL: $svc has <3 spans"; fail=1; }
done

[ $fail -eq 0 ] && echo "GATE_TRACE: PASS" || { echo "GATE_TRACE: FAIL"; exit 1; }
