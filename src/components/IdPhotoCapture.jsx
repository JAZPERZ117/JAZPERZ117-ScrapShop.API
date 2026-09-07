import { useRef, useState } from 'react';
import { IconIdCard, IconX } from '../icons.jsx';

// Downscales/compresses the captured photo client-side before it goes into localStorage —
// full-resolution phone camera photos (often 3-8MB) would blow through the storage quota
// after just a handful of customers, so this keeps each photo to roughly 50-150KB.
function resizeImageFile(file, maxDim = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height >= width && height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

export default function IdPhotoCapture({ value, onChange, onError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await resizeImageFile(file);
      onChange(dataUrl);
    } catch (err) {
      onError?.(err.message || 'ไม่สามารถอ่านรูปภาพนี้ได้');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="id-photo-capture">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      {value ? (
        <div className="id-photo-preview">
          <img src={value} alt="รูปบัตรประชาชน" onClick={() => window.open(value, '_blank')} title="กดเพื่อดูขนาดเต็ม" />
          <div className="id-photo-actions">
            <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => inputRef.current?.click()} disabled={busy}>
              <IconIdCard style={{ width: 14, height: 14 }} />
              ถ่ายรูปใหม่
            </button>
            <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onChange('')} disabled={busy}>
              <IconX style={{ width: 14, height: 14 }} />
              ลบรูป
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => inputRef.current?.click()} disabled={busy}>
          <IconIdCard />
          {busy ? 'กำลังประมวลผลรูป...' : 'ถ่ายรูปบัตรประชาชน'}
        </button>
      )}
    </div>
  );
}
