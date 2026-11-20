# PDF Studio — Web PDF Tool

Ứng dụng **React + Vite, chỉ frontend**, phát triển độc lập với project WPF. Toàn bộ mã nguồn, dependency, cache và bản build của web nằm trong `Web_PDF_Tool`.

Không có API/backend, tài khoản, analytics hay upload tài liệu. File được đọc trong RAM của trình duyệt, kết quả được tải về máy. Không lưu tài liệu vào localStorage/IndexedDB. Chuyển sang công cụ khác hoặc tải lại trang sẽ xóa phiên xử lý hiện tại. File người dùng đã tải về vẫn nằm trên máy của họ.

## Chạy trên Windows, giữ cache/temp trong thư mục web

Cần Node.js **22.12 trở lên** (đã có trên máy phát triển). Không cần cài Node toàn cục mới, LibreOffice, .NET hay Microsoft Office cho web.

Mở PowerShell trong `Web_PDF_Tool`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 install
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 dev
```

Mở URL Vite in ra, mặc định `http://127.0.0.1:5173`.

Script này chỉ đổi `TEMP`, `TMP`, `npm_config_cache` trong tiến trình chạy; không sửa thiết lập Windows. Cache npm ở `.cache/npm`, file tạm ở `.cache/tmp`, cache Vite ở `.cache/vite`. Node/npm sử dụng bản đã cài trên máy. Không cài package global. `.npmrc` cũng đặt cache cục bộ khi dùng npm trực tiếp.

Trên Linux/macOS hoặc CI:

```sh
npm ci
npm run dev
```

## Chức năng

| Công cụ | Trạng thái / phạm vi |
| --- | --- |
| Ghép PDF | Nhiều file; đổi thứ tự bằng kéo thả hoặc nút di chuyển; xuất một PDF |
| Tách PDF | Lấy một dãy trang; mỗi trang một PDF; các nhóm trang thành ZIP |
| Chỉnh sửa & sắp xếp trang | Thumbnail, xoay, xóa, chọn nhiều trang, đổi thứ tự, đặt lại; hàng nút cố định khi đổi hướng trang |
| Watermark | Chữ tiếng Việt hoặc PNG/JPG; màu, cỡ chữ, góc, độ đậm, trang áp dụng; hai khung gốc/kết quả xem trước tự cập nhật |
| Đọc PDF | Mặc định cuộn dọc liên tục; tùy chọn từng trang với vùng bấm trái/phải và phím ← →; chọn số trang, phóng to/thu nhỏ |
| So sánh PDF | SHA-256, số trang, chữ trích xuất và hình ảnh render theo từng trang |
| Xóa nền chữ ký | Xóa nền trắng/sáng; chỉnh mềm viền; cắt và xoay ảnh; hoàn tác/làm lại; xuất PNG alpha |
| Word → PDF | Giao diện “Phát triển sau”, chưa nhận file |
| Excel → PDF | Giao diện “Phát triển sau”, chưa nhận file |
| Bảo vệ PDF | Giao diện “Phát triển sau”, chưa đặt mật khẩu/phân quyền cho file xuất |

Các công cụ cuối chưa có engine phù hợp trong bản React này; không có API giả hoặc âm thầm gửi file tới bên thứ ba. Sau này có thể tích hợp WASM hoặc backend qua lớp xử lý độc lập.

### Giới hạn rõ ràng

- Khung đọc PDF, xem bản gốc khi tách và xem kết quả mặc định dùng cuộn dọc. Số trang cập nhật theo vị trí cuộn; nhập số trang hoặc bấm nút trước/sau để chuyển nhanh. Chế độ **Từng trang** cho phép bấm nửa trái/phải của trang hoặc dùng phím mũi tên khi khung đọc có focus. Đổi chế độ giữ trang đang đọc; chọn file khác đặt lại trang 1 và chế độ cuộn dọc. Các trang ngoài vùng đọc dùng khung giữ chỗ thay cho canvas để giảm bộ nhớ. Hai khung watermark trực tiếp vẫn dùng điều khiển đồng bộ riêng.

- PDF tối đa 100 MB/file, 200 MB/lượt, 100 file/lượt. Thực tế còn phụ thuộc RAM, độ phức tạp của PDF và thiết bị.
- Các công cụ nhận PDF mã hóa bằng mật khẩu qua **QPDF WebAssembly**, chạy trong worker trên thiết bị. File chỉ hạn chế in/copy/chỉnh sửa, có mật khẩu mở rỗng, được tự mở khóa; file cần mật khẩu sẽ hiện hộp nhập mật khẩu mở hoặc mật khẩu chủ sở hữu. Có thử lại khi sai, hủy và hủy khi đổi công cụ. Không dò mật khẩu; không hỗ trợ mọi kiểu bảo vệ đặc thù (ví dụ mã hóa bằng chứng thư). Bộ QPDF (~3,25 MB chưa nén, ~0,90 MB gzip) chỉ tải khi gặp PDF mã hóa, phục vụ cùng website, không dùng CDN/API. Không chuyển các trang thành ảnh khi mở khóa.
- Mật khẩu và bản PDF đã mở khóa chỉ nằm trong bộ nhớ phiên; mỗi lần thử dùng worker riêng rồi hủy. Bản xuất sau chỉnh sửa **không giữ mật khẩu hoặc hạn chế quyền**; file gốc không đổi. Giới hạn dung lượng áp dụng cả sau mở khóa. Khi so sánh, SHA-256 vẫn tính trên hai file gốc; chữ/hình được so từ bản đã mở khóa.
- Chỉnh sửa & sắp xếp trang không sửa nội dung chữ có sẵn trong PDF.
- Ghép/tách/copy trang có thể không giữ bookmark, chữ ký số, hoặc biểu mẫu tương tác. Luôn kiểm tra bản xuất cho tài liệu có các thành phần này.
- Watermark nằm trên nội dung trang, ở giữa CropBox; tự thu nhỏ để vừa trang, tính cả góc xoay và hướng trang. Font Noto Sans hỗ trợ tiếng Việt/Latin; ký tự không được hỗ trợ sẽ báo lỗi.
- Watermark có hai khung xem trước cùng trang/tỷ lệ; cập nhật sau khi ngừng chỉnh khoảng 300 ms. Preview chỉ tạo trang đang xem bằng cùng engine với file xuất, tác vụ cũ được hủy khi chỉnh tiếp. Trang ngoài phạm vi đóng dấu được giữ nguyên. Trên điện thoại hai khung xếp dọc. Preview nằm trong RAM và không tự tải hoặc lưu tài liệu; nút “Thêm watermark” vẫn tạo bản PDF đầy đủ để tải xuống.
- So sánh ảnh dùng cạnh dài tối đa khoảng 1.000 px, dung sai màu 20/255 và ngưỡng khác biệt 0,01%. Đây là đối chiếu hiển thị, không kiểm định pháp lý hay so sánh cấu trúc đầy đủ. Không OCR. Khi hai file có SHA-256 giống nhau mới kết luận dữ liệu file giống hoàn toàn.
- Xóa nền chữ ký không phải AI; nên dùng mực tối trên nền sáng. Tối đa 20 MB và 16 triệu điểm ảnh.
- Sau khi chọn ảnh chữ ký, bấm **Chỉnh ảnh** để cắt hoặc xoay trái/phải 90°. Trong chế độ cắt, kéo chọn vùng giữ lại, kéo khung để di chuyển, kéo các góc để đổi kích thước, hoặc nhập tọa độ/kích thước pixel. Khung kết quả xem trước vùng cắt đã xóa nền. Bấm **Áp dụng cắt** hoặc **Hủy cắt** trước khi xuất PNG. Hoàn tác/làm lại và **Đặt lại ảnh gốc** luôn lấy lại dữ liệu từ ảnh ban đầu; file PNG tải xuống mang kích thước/hướng ảnh sau chỉnh sửa, không ghi đè ảnh gốc.
- Mỗi tác vụ PDF có thể hủy bằng nút “Hủy tác vụ”. Đổi công cụ cũng hủy tác vụ đang chạy. Kiểm tra file đầu vào vẫn chạy trên luồng giao diện nên file phức tạp có thể gây chậm trong bước đọc.
- Cần trình duyệt hiện đại hỗ trợ module worker, canvas và Web Crypto (khuyến nghị Chrome/Edge/Firefox phiên bản mới). Deploy qua HTTPS; localhost được dùng khi phát triển. Chưa chứng nhận Safari hoặc các trình duyệt di động cũ.
- Không phải PWA/offline-first: lần mở đầu và công cụ chưa tải cần kết nối tới hosting. Thư viện, font, worker và các asset đều được phục vụ cùng website, không dùng CDN bên thứ ba.

## Build tĩnh

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 preview
```

Kết quả trong **`dist/`**. Chỉ deploy nội dung thư mục đó, không upload `node_modules`, `.cache`, `tests` hoặc source WPF. Không mở `dist/index.html` bằng `file://`; dùng HTTP(S) để module worker hoạt động.

`base: './'` và hash routing (`#/merge`, `#/split`…) giúp chạy ở domain gốc lẫn đường dẫn con. Không cần cấu hình rewrite SPA. PDF.js/fontkit chỉ được tải khi mở công cụ hoặc sử dụng chức năng cần tới chúng.

### Vercel

1. Import repository.
2. Nếu repository chứa cả WPF: chọn **Root Directory = `Web_PDF_Tool`**. Nếu repository chỉ chứa nội dung folder này: để mặc định.
3. Framework **Vite**, Install `npm ci`, Build `npm run build`, Output **`dist`**, Node **22.x**.
4. Deploy. Không cần biến môi trường, API key hay backend. `vercel.json` đã có cấu hình build.

### GitHub Pages

**Cách gọn nhất:** đưa riêng nội dung `Web_PDF_Tool` vào một repository web. File `.github/workflows/pages.yml` có sẵn sẽ nằm đúng ở root repository. Vào **Settings → Pages → Source: GitHub Actions**, push nhánh `main` hoặc chạy workflow thủ công.

**Nếu giữ chung repository WPF:** GitHub chỉ đọc workflow ở `.github/workflows/` tại root repository. Khi chuẩn bị deploy, copy `Web_PDF_Tool/.github/workflows/pages.yml` vào `.github/workflows/pages.yml` ở root. Workflow tự nhận biết thư mục web. Hiện chưa tạo file ngoài `Web_PDF_Tool` theo yêu cầu tách biệt mã nguồn.

Nếu nhánh chính không phải `main`, sửa `on.push.branches` trong workflow. Không cần đổi base URL theo tên repository.

## Kiểm thử

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 build
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/local.ps1 test:browser
```

- Unit tests: chọn trang, input lỗi, ghép/tách/sắp xếp, góc xoay gốc, watermark tiếng Việt/ảnh, alpha xóa nền.
- Browser smoke test: chạy **bản build thật dưới `/pdf-tool/`**, upload fixture, tải PDF/ZIP/PNG, đọc lại kết quả, xem trước, so sánh, mobile, chức năng chờ phát triển và kiểm tra không có request upload hoặc tới domain bên ngoài.
- Kiểm tra hàng nút giữ nguyên vị trí qua bốn hướng xoay trên desktop/mobile; PDF hạn chế quyền, AES-128/AES-256, mật khẩu đúng/sai/chủ sở hữu, hủy nhập, đổi công cụ; đọc lại file đã mở khóa, đối chiếu chữ và hình ảnh với bản gốc chưa mã hóa.
- Browser test dùng Chrome sẵn có tại `C:/Program Files/Google/Chrome/Application/chrome.exe`, **không tải/cài thêm browser**. Profile riêng và file tạm ở `.cache` trong folder web. Đặt biến `PDF_TOOL_BROWSER` để dùng đường dẫn Chrome/Chromium khác (trên Linux mặc định `/usr/bin/chromium`).
- Screenshot và file kiểm thử xuất vào `test-results/`, không commit hoặc deploy. Test tự tắt server và browser sau khi hoàn tất.

## Cấu trúc

```text
src/
  App.jsx                 # Layout, dashboard, hash routing
  components/             # Workbench, viewer, chỉnh trang, chữ ký
  data/tools.js           # Danh sách và trạng thái công cụ
  lib/pdf-core.js         # Xử lý PDF độc lập với giao diện
  lib/pdf.worker.js       # Ghép/tách/sắp xếp/watermark/ZIP trong worker
  lib/decrypt.worker.js   # QPDF WASM, chỉ chạy khi gặp PDF mã hóa
  lib/pdf-view.js         # PDF.js và so sánh hiển thị
  styles.css              # Responsive UI
public/fonts/             # Noto Sans + giấy phép OFL
public/pdfjs/             # Tự tạo từ dependency khi dev/build, gitignored
scripts/                  # Cache/temp cục bộ và chuẩn bị asset
tests/                    # Unit + browser smoke tests
.github/workflows/        # Workflow GitHub Pages
```

Không chỉnh project WPF, solution hoặc publish profile gốc. Khi cần backend, giữ UI và thay lớp xử lý tương ứng; không cần dựng lại toàn bộ giao diện.

## Thư viện / giấy phép

- React, Vite, pdf-lib, @pdf-lib/fontkit, fflate: MIT.
- PDF.js (`pdfjs-dist`): Apache-2.0; font/CMap đi kèm giữ giấy phép trong gói asset.
- Lucide: ISC.
- Noto Sans: SIL Open Font License 1.1, xem `public/fonts/OFL.txt`.
- Playwright Core: Apache-2.0, chỉ dùng cho kiểm thử phát triển.
- [@soulehshaikh99/qpdf-wasm 0.4.0](https://github.com/soulehshaikh99/qpdf-wasm): wrapper ISC, QPDF Apache-2.0; kèm zlib và libjpeg-turbo. Giấy phép đi kèm bản web ở `public/licenses/`.

Các công cụ đang triển khai không dùng Syncfusion hoặc LibreOffice, không yêu cầu license key thương mại.
#   P D F - S t u d i o - w e b s i t e -  
 
