# X MVP implementation notes

Mục tiêu: hỗ trợ X trong cùng extension, ưu tiên thao tác thủ công và tải dần để tránh quét toàn bộ conversation.

## Capture strategy

- Chỉ hỗ trợ URL dạng `https://x.com/<user>/status/<id>` trong MVP.
- Post gốc được xác định bằng status id trong URL và snapshot thành Research Item.
- Reply picker chỉ snapshot các reply đang được X render trong DOM.
- Khi người dùng bấm `Tải thêm`, content script scroll thêm một đoạn rồi snapshot batch mới.
- Các snapshot cũ được giữ trong memory để không bị mất khi X virtualize DOM.
- Không suy diễn full reply tree từ thứ tự DOM vì X có ranking/grouping conversation.

## Safety / accuracy rules

- Không gọi API private/undocumented của X trong MVP.
- Không crawl full conversation.
- Không tự export.
- Không gán parentId nếu không có bằng chứng đủ chắc chắn.
