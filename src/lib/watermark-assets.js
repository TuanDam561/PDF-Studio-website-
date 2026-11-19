let fontBytes;

export async function watermarkAssets(options, image, signal) {
  if (options.kind === 'text') {
    if (!options.text.trim()) throw new Error('Nhập nội dung dấu chìm để xem trước.');
    if (!fontBytes) {
      const response = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`, { signal });
      if (!response.ok) throw new Error('Không tải được font tiếng Việt. Hãy kiểm tra kết nối và thử lại.');
      fontBytes = await response.arrayBuffer();
    }
    return { fontBytes };
  }
  if (!image) throw new Error('Chọn ảnh PNG hoặc JPG để xem trước dấu chìm.');
  return { imageBytes: await image.arrayBuffer() };
}
