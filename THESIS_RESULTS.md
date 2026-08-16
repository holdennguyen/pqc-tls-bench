# Kết quả cuối cùng — bản chép vào luận văn (Chương 4)

Nguồn số liệu: `results/` tại commit hiện hành. **Quy ước "lần chạy chính thức":**
mỗi lần `make bench` / `make scan` GHI ĐÈ toàn bộ `results/` — bộ dữ liệu chính thức
là bộ CUỐI CÙNG được commit, không phải trung bình của nhiều lần chạy. Các lần chạy
tay/demo không thể ghi vào `results/` (cơ chế `OFFICIAL=1`), nên dữ liệu dưới đây
không bị pha tạp. Metadata của lần quét chính thức nằm ngay trong `scan.json`:

> when: 2026-08-16 10:20 UTC · OpenSSL 3.5.6 · phương pháp: 1 bắt tay TLS 1.3/host,
> chào `X25519MLKEM768:X25519`, không gửi HTTP, timeout 5 s, không retry.

Môi trường đo: Apple Silicon (ARM64), Docker qua Colima (8 CPU / 12 GB), mạng bridge
nội bộ (loopback-class); netem bổ sung +20 ms cho kịch bản RTT thực. Mỗi kịch bản
3 reps, warm-up loại bỏ; percentile tính trong từng rep, CI 95% giữa các rep (t = 4.303).

---

## 4.1 Chi phí bắt tay theo từng chặng (probe OpenSSL, 3 reps × 100 bắt tay)

Bảng: thời gian bắt tay p50 (ms) ± CI95, từ `results/probe_summary.csv`.

| Chặng | Classic (X25519) | Hybrid (X25519MLKEM768) | Δ tuyệt đối | Δ tương đối |
|---|---|---|---|---|
| H1 edge (nginx) | 0.274 ± 0.007 | 0.351 ± 0.003 | +0.077 ms | +28.1 % |
| H2a api-python | 0.276 ± 0.006 | 0.361 ± 0.026 | +0.085 ms | +30.8 % |
| H2b api-node | 0.270 ± 0.002 | 0.347 ± 0.003 | +0.077 ms | +28.5 % |
| H3 PostgreSQL | 0.348 ± 0.009 | 0.461 ± 0.011 | +0.113 ms | +32.5 % |
| H4 Redis | 0.268 ± 0.009 | 0.346 ± 0.010 | +0.078 ms | +29.1 % |

p95 cùng xu hướng (vd H1: 0.316 ± 0.019 vs 0.391 ± 0.025 ms). Diễn giải: chi phí
tương đối +28…33 % nghe lớn, nhưng tuyệt đối **< 0.12 ms mỗi bắt tay** trên mọi chặng —
cùng bậc với một lần round-trip nội bộ. Chặng H3 (PostgreSQL) đắt nhất do STARTTLS
(preamble SSLRequest) cộng thêm trước bắt tay.

## 4.2 Chi phí byte trên đường truyền (probe + tshark, đối chứng độc lập)

Tổng byte TLS mỗi bắt tay H1 (probe, p50): classic **1 541 B** (597 ra + 944 vào) →
hybrid **3 582 B** (1 550 ra + 2 032 vào), tức ~2.3×. tshark bắt gói độc lập
(`h1_tshark_bytes.csv`, 5 stream/chế độ) cho phần bản ghi handshake:

| Chiều | Classic | Hybrid | Δ | Đối chiếu FIPS 203 |
|---|---|---|---|---|
| client → server | 356 B | 1 532 B | **+1 176 B** | public key ML-KEM-768 = 1 184 B |
| server → client | 1 005–1 006 B | 2 093–2 095 B | **+1 089 B** | ciphertext ML-KEM-768 = 1 088 B |

Chiều server còn được probe xác nhận độc lập (+1 088 B). Kết luận: phần phình đúng
bằng kích thước khóa/bản mã ML-KEM-768 theo chuẩn — không có overhead ẩn nào khác.

## 4.3 Dưới tải k6 (open model, constant-arrival-rate; 3 reps × 30 s, warm-up 10 s loại)

Thời gian bắt tay TLS (`http_req_tls_handshaking`, ms) từ `results/k6_summary.csv`:

| Kịch bản | Classic p95 | Hybrid p95 | Nhận xét |
|---|---|---|---|
| churn @15 rps, RTT ~0 | 1.822 ± 0.070 | 2.369 ± 0.147 | tách rõ, CI không chồng lấn |
| churn @45 rps, RTT ~0 | 1.569 ± 0.033 | 1.810 ± 0.046 | vẫn tách ở p95 |
| churn @15 rps, **+20 ms RTT** | 23.280 ± 0.461 | 23.302 ± 0.826 | **chênh lệch biến mất** |
| pooled @15 rps | 0.935 ± 0.524 | 1.124 ± 0.558 | CI chồng lấn |
| pooled @45 rps | 0.885 ± 0.269 | 0.737 ± 0.330 | CI chồng lấn (hybrid còn thấp hơn) |

Ghi chú trung thực (nên tự khai trong luận văn):
- Ở pooled, p50 bắt tay = 0 ở cả hai chế độ (đa số request tái dùng kết nối — đúng
  thiết kế); p95 khác 0 chỉ vì số ít kết nối mới. CI chồng lấn ⇒ **chi phí khấu hao ≈ 0**,
  giả thuyết trung tâm được xác nhận.
- Ở churn @45 rps, p50 hybrid (1.254 ± 0.054) thấp hơn classic (1.360 ± 0.026):
  khi CPU bão hòa hơn, nhiễu lập lịch cùng bậc với chênh lệch mật mã — bằng chứng
  thêm rằng chi phí ML-KEM nhỏ so với nhiễu hệ thống.
- Tỷ lệ lỗi = 0.000 và throughput đạt đúng rate đặt ở TOÀN BỘ 10 kịch bản
  (15.0/45.3 req/s) — hệ thống chưa từng bị đẩy tới bão hòa, số liệu latency hợp lệ.

## 4.4 Phát hiện chính: RTT thực nhấn chìm chi phí mật mã

Với netem +20 ms (RTT khứ hồi thực tế trong nước): p95 bắt tay 23.302 ± 0.826 (hybrid)
vs 23.280 ± 0.461 ms (classic) — chênh lệch **0.02 ms, nằm gọn trong CI**. Chi phí
tính toán +0.5 ms đo được ở RTT~0 trở nên KHÔNG THỂ PHÂN BIỆT khi cộng độ trễ mạng
thật, vì bắt tay TLS 1.3 vẫn 1-RTT ở cả hai chế độ (phần phình +1.2 KB chưa vượt
initcwnd nên không thêm round-trip).

**Kết luận thực nghiệm (RQ1):** chi phí hybrid chỉ quan sát được trên kết nối churn
ở mạng nội bộ; trên đường truyền thực nó bị RTT nuốt trọn, và trên kết nối pooled
(DB/cache — mẫu hình phổ biến của backend) nó khấu hao về ≈ 0. Bật X25519MLKEM768
ở biên là gần như miễn phí về hiệu năng.

## 4.5 Mức độ sẵn sàng PQC ngoài thực tế (pqscan, RQ2)

Quét 105 host (danh sách trong `pqscan/hosts.txt`), ngày 16/08/2026, một bắt tay/host:

| Phân loại | Số host | Ghi chú |
|---|---|---|
| **Đã PQC** (TLS 1.3, X25519MLKEM768) | **41 / 93 trả lời hợp lệ (44.1 %)** | Google, Meta, Wikipedia, mọi site sau Cloudflare… |
| TLS 1.3, X25519 (cổ điển) | 39 | hiện đại nhưng chưa bật PQC |
| TLS 1.2, X25519 | 9 | vd zingnews.vn, techcombank, BIDV, ACB |
| TLS 1.2, DH trường hữu hạn | 3 | sendo.vn, thegioididong.com, airbnb.com |
| TLS 1.2, **RSA tĩnh — không PFS** | 1 | fpt.vn — ca phơi nhiễm HNDL nặng nhất |
| Không có HTTPS (chỉ cổng 80) | 2 | nttu.edu.vn, most.gov.vn |
| Lỗi (WAF từ chối chào scanner / không kết nối) | 10 | bing, microsoft, lazada… (443 mở nhưng lọc fingerprint) |

Phân tách Việt Nam vs quốc tế — con số đắt giá nhất cho phần thảo luận:

| Nhóm | Trả lời hợp lệ | Đã PQC | Tỷ lệ |
|---|---|---|---|
| Quốc tế | 57 | 35 | **61.4 %** |
| Việt Nam (.vn) | 36 | 6 | **16.7 %** |

6 host VN đã PQC: dantri.com.vn, mobifone.vn, fptshop.com.vn, vietcombank.com.vn,
vpbank.com.vn, ntt.edu.vn — đáng chú ý là phần lớn đạt được "miễn phí" nhờ đứng sau
CDN (Cloudflare). Ngân hàng/chính phủ VN tự vận hành hạ tầng phần lớn chưa bật,
một số còn ở TLS 1.2; fpt.vn (một ISP) dùng RSA tĩnh — mọi lưu lượng bị ghi lại
hôm nay có thể giải mã hồi tố chỉ với MỘT khóa riêng bị lộ.

**Kết luận (RQ2):** khoảng cách triển khai không nằm ở chi phí kỹ thuật (mục 4.1–4.4
cho thấy chi phí ≈ 0) mà ở vận hành: nơi nào hạ tầng TLS được ủy thác cho CDN/nền
tảng lớn thì PQC đã đến; nơi tự vận hành thì chưa.

## 4.6 Giới hạn của số liệu (chép vào phần Limitations)

1. Một máy ARM64, mạng ảo loopback-class — delta tuyệt đối ngoài thực tế lớn hơn chút,
   nhưng thí nghiệm netem (4.4) cho thấy RTT thật càng làm chênh lệch khó phân biệt hơn.
2. Chứng chỉ tự ký ECDSA P-256; chưa đo chữ ký hậu lượng tử (ML-DSA) — future work.
3. pqscan là ảnh chụp một thời điểm, một mạng, một bắt tay/host — không phải điều tra
   dọc; 10 host "lỗi" là từ chối scanner (WAF), không kết luận được gì về PQC của họ.
4. n = 3 reps là mức tối thiểu cho CI; t = 4.303 làm CI rộng — trung thực hơn là đẹp.
