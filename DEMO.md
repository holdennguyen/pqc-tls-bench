# DEMO — defense walkthrough (~6 phút) + backup video script

Chuẩn bị (trước khi vào phòng): `colima start` → `make up` → `make gates` (phải GREEN).
Mở sẵn 5 tab: `https://localhost:8443` · `https://localhost:8444` · `:8443/app` ·
`http://localhost:3000/d/pqc-vs-classic` · `http://localhost:16686`.

## 1. Hai cổng, một biến số (60s)
- Tab :8443 — badge đầu trang **ĐỎ `X25519MLKEM768`**; tab :8444 — badge **XANH `X25519`**.
  (Lưu ý: nếu trình duyệt/curl không hỗ trợ ML-KEM, cổng lai ghép fallback X25519 —
  đó CHÍNH LÀ lý do đo bằng client OpenSSL 3.5 trong mạng nội bộ.)
- Nói: "Khác biệt duy nhất giữa hai hệ thống là MỘT dòng cấu hình — danh sách nhóm trao đổi khóa."
- Terminal: `make verify` → in "Negotiated group: X25519MLKEM768 / X25519".

## 2. Ứng dụng bệnh án — mọi chặng nhìn thấy được (90s)
- /app: đăng nhập demo (bất kỳ tài khoản nào — nói rõ "xác thực chỉ minh họa").
- Danh sách hồ sơ (dữ liệu tổng hợp): tìm kiếm theo tên/chẩn đoán, phân trang.
  Đổi dropdown Python ⇄ Node — chip màu đổi theo.
- Tạo một hồ sơ mới → chip hiện: API phục vụ, nhóm TLS của kết nối, cache hit/miss.
- Mở một hồ sơ rồi bấm "Tải lại (xem cache)" → chip `cache: hit` (Redis, cũng qua TLS).
- CHỈ VÀO DẢI "ĐƯỜNG TRUYỀN" ở chân trang: mỗi thao tác in một dòng sensor
  (fn, ms, ok, bất biến) — đúng contract sensor của backend, chạy ngay trong trình duyệt.
  Bật chi tiết: DevTools console + `localStorage.LOG_SENSORS="1"`.

## 3. Truy vết một request (60s)
- Jaeger: service `api-python-hybrid`, Find Traces → mở trace POST /records:
  span API → span INSERT (PostgreSQL) → span Redis. "Một request người dùng, xuyên
  qua 3 chặng TLS, tất cả trong một trace."

## 4. Dashboard dưới tải trực tiếp (2 phút — điểm nhấn)
- Chạy tải live ở terminal (2 lệnh, mỗi lệnh một cổng). An toàn theo thiết kế:
  chỉ run_all.sh (OFFICIAL=1) mới ghi file vào results/ — mọi lần chạy tay/demo
  chỉ stream metrics lên Grafana, không thể làm bẩn dữ liệu chính thức:
  ```
  docker compose --profile bench run --rm -d k6 run /scripts/scenario.js \
    -e MODE=hybrid -e PROFILE=churn -e RATE=30 -e DURATION=3m \
    -o experimental-prometheus-rw --tag testid=hybrid-churn-live --tag mode=hybrid --tag profile=churn
  docker compose --profile bench run --rm -d k6 run /scripts/scenario.js \
    -e MODE=classic -e PROFILE=churn -e RATE=30 -e DURATION=3m \
    -o experimental-prometheus-rw --tag testid=classic-churn-live --tag mode=classic --tag profile=churn
  ```
- Grafana: hai stat tile trên cùng (ĐỎ vs XANH) chênh nhau ~X ms; đồ thị p95 hai đường
  tách rõ ở churn, đường pooled (nét đứt) gần như trùng nhau → giả thuyết khấu hao.
- Chỉ vào CPU panel: chi phí tính toán ML-KEM nằm ở đâu.

## 5. Thế giới thực đã tới đâu? (45s)
- /scan: % website đã sẵn sàng PQC; các CDN lớn ĐỎ→đã bật, ngân hàng/chính phủ VN phần lớn chưa.
- Chốt: "Chi phí đo được là nhỏ và có thể khấu hao — trong khi rủi ro thu-thập-trước
  giải-mã-sau với hồ sơ y tế là vĩnh viễn. Kết luận: bật hybrid ngay ở biên."

## Backup video (quay Mon tối, 1 lần liền mạch)
Quay đúng trình tự 1→5 bằng QuickTime (⌘⇧5, quay màn hình + mic). Trước khi quay:
`make gates` xanh, dashboard đã có dữ liệu từ `make bench`. Nếu live k6 trục trặc lúc
bảo vệ: mở video + dashboard tĩnh (time range chỉnh về lúc chạy bench).

## Nếu hỏng giữa demo
- Badge không đổi màu → hard-refresh (⌘⇧R); kiểm tra `curl -sk https://localhost:8443/api/tls-info`.
- Grafana trống → sai time range (chọn Last 30 min); prometheus target: :9090/targets.
- k6 lỗi → bỏ qua live, dùng dashboard tĩnh + `results/summary.json` (số liệu chính thức).
