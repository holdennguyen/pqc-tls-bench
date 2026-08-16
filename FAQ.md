# FAQ — hỏi đáp bảo vệ (đúc kết từ quá trình xây dựng & đo đạc, 15–16/08/2026)

Mọi con số dẫn ở đây đều nằm trong `results/summary.json` / `results/scan.json` (3 reps, CI 95%).

## A. Thiết kế & phương pháp

**1. Vì sao chọn X25519MLKEM768 mà không phải ML-KEM thuần?**
Lai ghép (hybrid) là hướng triển khai thực tế: bí mật chung được ghép từ CẢ X25519 và
ML-KEM-768 (FIPS 203), nên kể cả khi một trong hai bị phá, phiên vẫn an toàn. Đây cũng là
nhóm mặc định Chrome/Cloudflare/Go đang dùng — kết quả đo phản ánh đúng thứ thế giới chạy.

**2. Biến số thí nghiệm được cô lập thế nào?**
Một dòng cấu hình duy nhất: danh sách nhóm trao đổi khóa CỦA CLIENT. Server (nginx, uvicorn,
Node, PostgreSQL, Redis) nhận tập superset — cấu hình y hệt giữa hai chế độ. Client mỗi chế độ
chào ĐÚNG MỘT nhóm: nginx qua `proxy_ssl_conf_command Groups`, Python qua `OPENSSL_CONF
system_default`, Node qua `ecdhCurve`.

**3. Làm sao chứng minh nhóm đã thương lượng khi Python không có API đọc nó?**
Bằng cấu trúc: client chỉ chào MỘT nhóm ⇒ bắt tay thành công ⇒ nhóm thương lượng = nhóm đó.
Đối chứng đã kiểm chứng: client chỉ-hybrid bị server chỉ-X25519 từ chối (handshake_failure).
Gate còn xác minh chéo bằng `pg_stat_ssl`, probe openssl 3.5 trong mạng, và sensor invariants.
(Lý do kỹ thuật: `ssl.set_ecdh_curve` của Python không nhận nhóm KEM, và không có getter.)

**4. Vì sao KHÔNG dùng service mesh (Istio/Linkerd)?**
Sidecar của mesh tự chấm dứt TLS và thay bằng mTLS riêng của nó — che mất chính biến số
đang đo (nhóm khóa ở tầng ứng dụng). Quan sát được thay bằng OpenTelemetry (auto-instrument).

**5. Vì sao Colima chứ không phải Docker Desktop? Vì sao pin digest?**
Colima = docker-ce thuần, giống hệt EC2 khi tái lập; tránh vấn đề bản quyền Docker Desktop.
Mọi image pin theo sha256 digest và đã kiểm OpenSSL ≥ 3.5 từng con (nginx 3.5.6, PG 3.5.6,
Redis→libssl hệ thống trixie, Node 25 bundled 3.5.5, python-slim 3.5.6, alpine/openssl 3.5.7).

**6. Số liệu được xử lý thống kê ra sao?**
Mỗi kịch bản 3 reps; 10 bắt tay warm-up đầu mỗi rep bị loại. Percentile tính TRONG từng rep,
rồi mean ± CI95 GIỮA các rep (t=4.303, n=3). k6 dùng open model (constant-arrival-rate) để
tránh coordinated omission. Gate `gate_bench` kiểm tra máy: đủ reps, không ô trống, CI tính được.

## B. Kết quả chính — và cách diễn giải

**7. Hybrid đắt hơn bao nhiêu?**
Mỗi chặng +0.077…+0.113 ms p50 mỗi bắt tay (+28…33% tương đối, nhưng tuyệt đối < 0.12 ms
trên đường truyền loopback-class). k6 churn @15rps: p95 2.37±0.15 ms vs 1.82±0.07 ms.

**8. Phát hiện quan trọng nhất?**
Với netem +20 ms RTT (mạng thật): 23.30±0.83 vs 23.28±0.46 ms — chênh lệch mật mã BIẾN MẤT
trong độ trễ mạng. Và ở pooled connections, CI hai chế độ chồng lấn (vd 0.74±0.33 vs
0.89±0.27) — chi phí khấu hao ≈ 0. Kết luận: bật hybrid ở biên gần như miễn phí.

**9. Bytes tăng thêm khớp lý thuyết không?**
Khớp chính xác. Probe và tshark độc lập cùng cho: ClientHello +1176 B (public key ML-KEM-768
= 1184 B), chiều server +1089 B (ciphertext = 1088 B). Tổng bắt tay H1 ~3.6 KB vs ~1.4 KB.

**10. Thế giới thực đã tới đâu (RQ2)?**
41/93 máy chủ trả lời hợp lệ đã thương lượng PQC (44%): Google, Meta, Wikipedia, và mọi site
sau Cloudflare — có. Amazon, GitHub, đa số ngân hàng/chính phủ VN — chưa.

## C. Những ca "kỳ lạ" đã điều tra (hỏi xoáy hay gặp)

**11. Sao badge trên cổng hybrid đôi khi hiện X25519?**
Vì CLIENT (curl/Safari của máy trình chiếu) không chào được ML-KEM — server hybrid fallback
X25519 đúng thiết kế. Đó là lý do số liệu chính thức đo bằng client OpenSSL 3.5 trong mạng.
Đây là tính năng demo tốt: badge phản ánh ĐÚNG kết nối thật của người xem.

**12. Vụ "false 0%" của pqscan là gì?**
OpenSSL in nhóm hybrid là `Negotiated TLS1.3 group:` nhưng nhóm cổ điển là `Peer Temp Key:`.
Regex chỉ bắt dạng sau ⇒ mọi host PQC bị đếm thành "lỗi" ⇒ 0% giả. Cùng một bẫy xuất hiện
3 lần (gate_tls, gate_api, pqscan). Khắc phục tận gốc: self-check trước khi quét (bắt tay
chỉ-hybrid với pq.cloudflareresearch.com phải thành công VÀ parse được, không thì từ chối
chạy) + trạng thái `parse-error` riêng, thoát mã 3 — hồi quy scanner không bao giờ im lặng.

**13. Vì sao vài host ra "DH"?**
Server TLS 1.2 cũ (sendo.vn, thegioididong.com, airbnb.com): không nhận X25519 trong chào
hiện đại của scanner nên rơi về DHE trường hữu hạn 2048 — TLS 1.2 không bị ràng buộc bởi
danh sách nhóm. Không hạn chế nhóm thì chúng dùng ECDHE P-256. Kiểu gì cũng chưa PQC.

**14. "RSA-static" của fpt.vn nghĩa là gì?**
TLS 1.2 với ciphersuite AES128-GCM-SHA256 = trao đổi khóa RSA TĨNH — không tồn tại nhóm
ephemeral để parse, và KHÔNG có forward secrecy: một khóa riêng bị lộ (hoặc bị máy tính
lượng tử phá) giải mã hồi tố TOÀN BỘ lưu lượng đã ghi. Ca phơi nhiễm HNDL nặng nhất bộ dữ liệu.

**15. Sao nttu.edu.vn "timeout" mà trình duyệt vẫn vào được?**
Hai máy chủ khác nhau của cùng một trường: `ntt.edu.vn` (site chính, sau Cloudflare) có HTTPS
và thậm chí thương lượng X25519MLKEM768; `nttu.edu.vn` (tự host, 112.213.89.38) bị chặn cổng
443 còn cổng 80 phục vụ HTTP KHÔNG mã hóa — trình duyệt "vào được" vì gõ tên miền trần mặc
định là http://. Verdict riêng `no-https` (cam, "chỉ HTTP"): dữ liệu đọc được NGAY HÔM NAY.
Cùng một trường trải cả hai đầu phổ phơi nhiễm — điểm nhấn thuyết trình.

**16. Còn bing.com / lazada.vn báo lỗi thì sao? Có phải ClientHello hybrid quá to?**
Không — đã kiểm: chào chỉ-cổ-điển cũng bị từ chối y hệt (WAF/lọc bot theo fingerprint TLS,
hoặc chỉ nhận nhóm khác như P-256). Cổng 443 vẫn mở nên scanner ghi trung thực "từ chối chào
của scanner", KHÔNG kết luận sai là thiếu HTTPS. Phân loại bằng probe TCP: 443 mở → lỗi TLS;
443 đóng + 80 mở → no-https; cả hai đóng → lỗi thường.

## D. Vận hành & tái lập

**17. Chạy lại toàn bộ thí nghiệm?**
`colima start` → `make up` → `make ui-build` (dựng SPA trong image node đã pin) →
`make gates` (9/9 PASS) → `make bench` (~25 phút, ghi results/) → `make scan`.
Mọi thứ trong repo công khai; image pin digest.

**18. Demo tải trực tiếp khi bảo vệ?**
Hai lệnh trong DEMO.md (một cho mỗi cổng). An toàn theo thiết kế: chỉ run_all.sh với
`OFFICIAL=1` mới được ghi vào results/ — chạy tay/demo chỉ stream lên Grafana, không thể
làm bẩn dữ liệu luận văn.

**19. Triết lý "gate" là gì?**
Vòng điều khiển: tính năng CHƯA TỒN TẠI cho tới khi gate (script yes/no tất định) xanh.
9 gates phủ: thương lượng nhóm, DB/cache TLS, tương đương chức năng 2 API (CRUD + tìm kiếm),
trace, chất lượng đo đạc, UI tĩnh, tính toàn vẹn bản dựng SPA, và hành vi frontend
(Playwright đọc lại sensor console — cùng một vòng điều khiển như backend). `make gates`
chạy sau mỗi commit; PENDING (exit 2) ≠ FAIL để tính năng tương lai không che hồi quy —
hai gate frontend đã sống ở trạng thái PENDING trước khi SPA tồn tại, đúng triết lý này.

## E. Giới hạn tự khai (trước khi hội đồng hỏi)

- Một máy ARM64 (Apple Silicon), mạng ảo loopback-class — delta tuyệt đối ngoài thực tế sẽ
  lớn hơn chút, nhưng kết luận netem cho thấy RTT thật càng NHẤN CHÌM chênh lệch.
- Chứng chỉ tự ký ECDSA P-256; chưa đo chữ ký hậu lượng tử (ML-DSA) — future work.
- pqscan: 1 bắt tay/host, 1 thời điểm, từ 1 mạng — snapshot, không phải điều tra dọc.
- 3 reps là tối thiểu cho CI; t=4.303 khiến CI rộng — trung thực hơn là đẹp.
