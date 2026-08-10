# Substack Context Capture

> 🇻🇳 Tài liệu tiếng Việt · [English README](README.md)

**Substack Context Capture** là Chrome Extension giúp lưu một bài viết Substack cùng các nhánh thảo luận/comment quan trọng thành một research package có cấu trúc, để cả người đọc và AI có thể hiểu lại đầy đủ ngữ cảnh sau này.

MVP hiện tại chủ động **không tích hợp AI, không crawler tự động và không cần backend**. Bạn tự chọn bài viết và nhánh thảo luận muốn lưu.

## Mục tiêu của project

Flow chính:

```text
Đọc bài trên Substack
        ↓
Save article
        ↓
Lưu text + cấu trúc + hình ảnh
        ↓
Đọc phần discussion/comments
        ↓
Select discussion thread
        ↓
Chọn một comment đáng lưu
        ↓
Lưu ancestor + comment đã chọn + replies bên dưới
        ↓
Merge vào cùng một Research Item
        ↓
Export Markdown / JSON / ZIP
```

Mục tiêu không phải chỉ bookmark một URL, mà là giữ được **ngữ cảnh của bài viết và luồng tranh luận** để sau này có thể dùng cho nghiên cứu, tổng hợp kiến thức hoặc đưa cho ChatGPT/Claude/LLM phân tích.

## Tính năng hiện tại

- Lưu nội dung bài Substack thành các block có cấu trúc.
- Giữ heading, paragraph, quote, list, code và hình ảnh.
- Lưu URL ảnh và tải ảnh vào package khi export ZIP.
- Chọn một comment trực tiếp trên trang.
- Lưu toàn bộ đường dẫn context từ comment cha đến comment đã chọn.
- Lưu các reply đang được hiển thị bên dưới comment đã chọn.
- Không lấy các sibling branch không liên quan.
- Merge nhiều lần capture vào cùng một bài dựa trên canonical URL.
- Hạn chế duplicate thread.
- Lưu dữ liệu local bằng `chrome.storage.local`.
- Export `Markdown`, `JSON` hoặc `ZIP`.

## Cài đặt trên Chrome

Hiện extension chưa được publish lên Chrome Web Store, nên cài theo chế độ **Load unpacked**.

### Cách 1: Clone bằng Git

Mở Terminal:

```bash
git clone https://github.com/vnlocph/substack-context-capture.git
cd substack-context-capture
```

Project hiện tại **không cần `npm install` và không cần build** để chạy extension.

Sau đó:

1. Mở Google Chrome.
2. Nhập vào thanh địa chỉ:

   ```text
   chrome://extensions
   ```

3. Bật **Developer mode** ở góc trên bên phải.
4. Chọn **Load unpacked**.
5. Chọn folder:

   ```text
   substack-context-capture
   ```

6. Extension sẽ xuất hiện trong danh sách Chrome Extensions.
7. Có thể bấm biểu tượng ghim trong menu Extensions để ghim extension lên thanh công cụ.

### Cách 2: Download ZIP từ GitHub

1. Mở repository trên GitHub.
2. Chọn **Code → Download ZIP**.
3. Giải nén file ZIP.
4. Mở:

   ```text
   chrome://extensions
   ```

5. Bật **Developer mode**.
6. Chọn **Load unpacked**.
7. Chọn folder vừa giải nén.

> Khi chọn `Load unpacked`, hãy chọn folder chứa trực tiếp file `manifest.json`, không chọn folder cha bên ngoài.

## Sau khi cài xong

Nếu bạn đã mở Substack trước khi cài extension, hãy **reload tab Substack một lần** để Chrome inject content script.

Sau đó mở một bài viết trên:

```text
https://*.substack.com/...
```

hoặc:

```text
https://substack.com/...
```

Bấm icon extension để mở side panel.

## Cách sử dụng

### 1. Lưu bài viết

Mở bài Substack muốn nghiên cứu.

Trong side panel chọn:

```text
Save article
```

Extension sẽ thu thập nội dung bài viết và lưu vào local storage của Chrome.

Một bài tương ứng với một **Research Item**.

Nếu quay lại cùng bài và lưu thêm discussion sau này, dữ liệu mới sẽ được merge vào Research Item đã có thay vì tạo một bản sao mới.

### 2. Lưu một nhánh discussion/comment

Trước tiên hãy mở phần comments/discussion của bài.

Nếu thread có các nút kiểu **Show replies / replies**, hãy mở các reply bạn muốn lưu trước.

Sau đó trong side panel chọn:

```text
Select discussion thread
```

Các comment mà extension nhận diện được sẽ được highlight bằng viền.

Click vào comment bạn muốn lưu.

Ví dụ discussion:

```text
A
├── B
│   ├── C
│   │   ├── D
│   │   └── E
│   └── F
└── G
```

Nếu bạn chọn `C`, extension sẽ cố gắng lưu:

```text
A
└── B
    └── C
        ├── D
        └── E
```

Tức là:

- context phía trên (`A → B`);
- comment được chọn (`C`);
- replies bên dưới (`D`, `E`);
- không lấy các nhánh không liên quan (`F`, `G`).

Nhấn `Esc` để thoát chế độ chọn comment mà không lưu.

## Quan trọng khi capture comment

MVP hiện chỉ đọc được các comment/reply **đã được render trong DOM của trang**.

Vì vậy trước khi lưu thread:

1. mở phần comments;
2. expand các replies cần thiết;
3. sau đó mới chọn **Select discussion thread**.

Nếu một reply chưa được Substack tải/hiển thị trên trang thì extension chưa thể lưu reply đó.

## Research Library

Các bài đã lưu nằm trong local storage của extension.

Mỗi Research Item có thể chứa:

```text
Research Item
│
├── Article
│   ├── text blocks
│   └── images
│
├── Saved Thread 1
├── Saved Thread 2
├── Saved Thread 3
└── ...
```

Bạn có thể quay lại cùng bài nhiều lần và tiếp tục bổ sung các thread đáng chú ý.

## Export

Extension hỗ trợ ba định dạng.

### Markdown

Phù hợp nhất để:

- đọc bằng mắt;
- lưu vào Obsidian/Markdown editor;
- đưa trực tiếp cho ChatGPT, Claude hoặc LLM khác;
- tổng hợp kiến thức sau này.

Cấu trúc đại khái:

```markdown
# Article

## Metadata
...

## Content
...

# Saved Discussions

## Thread 1
...
```

### JSON

Giữ cấu trúc dữ liệu đầy đủ hơn để dùng cho phần mềm sau này, ví dụ:

- AI pipeline;
- RAG;
- embeddings;
- clustering;
- knowledge extraction;
- import vào database.

Comment giữ các trường quan hệ như `parentId` và `depth` để không mất cấu trúc hội thoại.

### ZIP

Đây là research package đầy đủ nhất:

```text
research-package.zip
│
├── research.md
├── research.json
│
└── assets/
    ├── image-001.webp
    ├── image-002.png
    └── ...
```

Nếu một ảnh không tải được, URL nguồn vẫn được giữ trong JSON. Package cũng có thể chứa `assets/FAILED_ASSETS.txt` để ghi lại các asset tải thất bại.

## Dữ liệu và quyền riêng tư

MVP hiện tại:

- không có backend;
- không gửi dữ liệu lên server của project;
- không gọi AI API;
- không tự động crawl Substack;
- không tự động thu thập hàng loạt bài;
- dữ liệu capture được lưu trong `chrome.storage.local` của extension.

Dữ liệu chỉ rời local storage khi chính bạn chọn export.

## Giới hạn hiện tại

Đây là MVP đầu tiên nên còn một số giới hạn:

- Hiện ưu tiên `substack.com` và `*.substack.com`.
- Publication dùng custom domain chưa được hỗ trợ đầy đủ.
- Comment detection đang dùng heuristic vì DOM Substack có thể thay đổi.
- Chỉ capture được comment/reply đang được render trên trang.
- Một số ảnh từ third-party host có thể không tải được vào ZIP.
- UI Research Library hiện còn tối giản.

## Nếu extension không hoạt động

### Không thấy extension trên bài Substack

Thử:

1. vào `chrome://extensions`;
2. kiểm tra extension đang bật;
3. bấm **Reload** trên card extension;
4. quay lại tab Substack;
5. reload trang.

### Side panel báo chưa kết nối được với trang

Reload tab Substack sau khi extension đã được cài hoặc reload.

### Không highlight được comment

- Kiểm tra đang ở phần comments/discussion.
- Expand reply trước.
- Reload trang rồi thử lại.
- DOM của publication đó có thể khác heuristic hiện tại.

Nếu gặp case này, nên ghi lại URL bài và screenshot để bổ sung detector.

### Export ZIP thiếu ảnh

Một số host ảnh có thể chặn request hoặc URL ảnh đã hết hạn. Nội dung text và URL ảnh gốc vẫn được giữ trong research data.

## Dành cho developer

Project hiện tại cố tình tối giản:

```text
Manifest V3
Chrome Side Panel
chrome.storage.local
Vanilla JavaScript
Không backend
Không framework UI
Không dependency runtime ngoài
```

Không cần build để chạy extension.

Các file chính:

```text
manifest.json
background.js
content.js
sidepanel.html
sidepanel.js
sidepanel.css
lib/
  model.js
  exporters.js
  zip.js
docs/
```

Chạy test:

```bash
npm test
```

Kiểm tra syntax:

```bash
npm run check
```

## Roadmap gần nhất

1. Test trên nhiều layout Substack thật và làm comment detection ổn định hơn.
2. Thêm màn hình xem chi tiết từng Research Item.
3. Cho phép xem/xóa từng saved thread trước khi export.
4. Hỗ trợ publication dùng custom domain.
5. Import/export toàn bộ Research Library.
6. Sau khi có đủ dữ liệu sử dụng thật mới bắt đầu phần AI:
   - giải thích nội dung;
   - tổng hợp kiến thức;
   - nhận diện các luồng quan điểm;
   - tạo ý tưởng chia sẻ lại.

## Trạng thái project

Đây là **MVP đang được thử nghiệm**. Mục tiêu trước mắt không phải thêm nhiều tính năng mà là kiểm chứng hai việc quan trọng nhất:

1. article capture có giữ đúng nội dung và hình ảnh không;
2. discussion capture có giữ đúng context tree hay không.

Nếu hai phần này ổn định, các lớp AI phía sau sẽ có dữ liệu đầu vào tốt hơn rất nhiều.
