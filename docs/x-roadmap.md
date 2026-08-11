# X-first roadmap

## Đã chốt cho MVP X

- Một extension chung: `Research Context Capture`.
- X là nguồn ưu tiên; Substack tiếp tục được hỗ trợ như nguồn phụ.
- Không làm author thread.
- Lưu post X đang mở, gồm text và media nhìn thấy được.
- Multi-select nhiều reply trong một lần mở picker.
- Progressive loading: chỉ snapshot reply đang render; `Tải thêm` mới scroll/quét thêm.
- Cache các reply đã quét để không mất dữ liệu khi X virtualize DOM.
- Chỉ ghi vào Research Library khi bấm `Thêm vào bài viết`.
- Không tự export; Markdown/JSON/ZIP chỉ tải khi người dùng bấm nút xuất.

## Có thể triển khai tiếp

1. Resolve parent chain chính xác cho reply con trên X.
2. Capture quote posts như một loại discussion riêng.
3. Tìm kiếm/filter reply đã quét theo từ khóa hoặc tác giả.
4. Đánh dấu reply để xem lại sau, chưa cần thêm vào Research Item ngay.
5. Hiển thị số comment thực tế sẽ được lưu trước khi xác nhận.
6. Deduplicate discussion giữa nhiều lần quét cùng một X post.
7. Cache theo phiên và khôi phục picker khi đóng/mở side panel.
8. Import/export toàn bộ Research Library.
9. Custom tags/notes do người dùng tự thêm cho Research Item.
10. Sau khi dữ liệu đủ tốt mới thêm AI: giải thích → tổng hợp kiến thức → tạo ý tưởng nội dung.

## Không làm lúc này

- Không crawl toàn bộ replies.
- Không tự động thu thập timeline/home feed.
- Không author thread.
- Không AI API trong flow capture.
- Không phụ thuộc X Developer API ở MVP đầu tiên.
