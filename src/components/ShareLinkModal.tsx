import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  Link2,
  MessageSquareText,
  QrCode,
  X,
} from 'lucide-react';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  departmentName: string;
  hospitalName: string;
  shareUrl: string;
  initialCopied?: boolean;
}

export function getShareableAppUrl(): string {
  const fallbackUrl =
    'https://ais-pre-rorcot2yks2vhtiltkq2qz-806528130656.asia-east1.run.app';
  if (typeof window === 'undefined' || !window.location?.origin) {
    return fallbackUrl;
  }
  const origin = window.location.origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    return fallbackUrl;
  }
  if (origin.includes('ais-dev-')) {
    return origin.replace('ais-dev-', 'ais-pre-');
  }
  return origin;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy textarea fallback
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  departmentName,
  hospitalName,
  shareUrl,
  initialCopied = false,
}) => {
  const [copiedType, setCopiedType] = useState<'none' | 'url' | 'invite' | 'qr-saved'>('none');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [downloadingQr, setDownloadingQr] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setCopiedType('none');
      return;
    }
    if (initialCopied) {
      setCopiedType('url');
    }

    let cancelled = false;
    setQrError(null);

    void QRCode.toDataURL(shareUrl, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError('ไม่สามารถสร้าง QR Code ได้ในขณะนี้');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialCopied, shareUrl]);

  if (!isOpen) return null;

  const inviteMessage = [
    `ลิงก์ระบบตารางเวรและเบิกค่าเวร OT`,
    `${departmentName} ${hospitalName}`,
    shareUrl,
    `วิธีเข้าใช้งานครั้งแรก: กดแท็บ "สมัครใช้งานใหม่" เพื่อตั้ง User และรหัสผ่านของตัวเอง จากนั้นเลือกชื่อบุคลากรเพื่อลงเวรได้เลยครับ`,
  ].join('\n');

  const handleCopyUrl = async () => {
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      setCopiedType('url');
    }
  };

  const handleCopyInvite = async () => {
    const ok = await copyTextToClipboard(inviteMessage);
    if (ok) {
      setCopiedType('invite');
    }
  };

  const handleDownloadQrCard = async () => {
    if (!qrDataUrl || downloadingQr) return;
    setDownloadingQr(true);
    try {
      const cardWidth = 720;
      const cardHeight = 880;
      const canvas = document.createElement('canvas');
      canvas.width = cardWidth;
      canvas.height = cardHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White card background with subtle border
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cardWidth, cardHeight);

      // Top teal header band
      ctx.fillStyle = '#0f766e';
      ctx.fillRect(0, 0, cardWidth, 168);

      // Header text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px "Sarabun", "Noto Sans Thai", sans-serif';
      ctx.fillText('ระบบตารางเวรและเบิกจ่ายค่าเวร OT', cardWidth / 2, 66);

      ctx.font = '600 22px "Sarabun", "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#ccfbf1';
      ctx.fillText(departmentName, cardWidth / 2, 108);

      ctx.font = '400 18px "Sarabun", "Noto Sans Thai", sans-serif';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(hospitalName, cardWidth / 2, 140);

      // Draw crisp QR code in center
      const qrImg = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject(new Error('QR image load failed'));
        qrImg.src = qrDataUrl;
      });

      const qrSize = 440;
      const qrX = (cardWidth - qrSize) / 2;
      const qrY = 212;

      // Subtle frame around QR
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.strokeRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Footer instructions
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px "Sarabun", "Noto Sans Thai", sans-serif';
      ctx.fillText('สแกน QR Code เพื่อเข้าลงเวรประจำเดือน', cardWidth / 2, 726);

      ctx.fillStyle = '#475569';
      ctx.font = '400 18px "Sarabun", "Noto Sans Thai", sans-serif';
      ctx.fillText(
        'เข้าใช้งานครั้งแรก: กด "สมัครใช้งานใหม่" เพื่อตั้ง User และรหัสผ่าน',
        cardWidth / 2,
        764,
      );

      // URL footer
      ctx.fillStyle = '#64748b';
      ctx.font = '400 14px monospace';
      ctx.fillText(shareUrl, cardWidth / 2, 822);

      // Outer border
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, cardWidth - 4, cardHeight - 4);

      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = 'QR_ระบบตารางเวร_วิสัญญี.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setCopiedType('qr-saved');
    } catch {
      // Fallback: download raw QR image directly
      const link = document.createElement('a');
      link.href = qrDataUrl;
      link.download = 'QR_ระบบตารางเวร_วิสัญญี.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setCopiedType('qr-saved');
    } finally {
      setDownloadingQr(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <QrCode className="w-4 h-4 text-teal-700" />
            <h2 className="text-sm font-bold text-slate-900">
              ส่งลิงก์ &amp; QR Code ให้เพื่อนในแผนก
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {copiedType !== 'none' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
              <Check className="w-4 h-4 shrink-0" />
              <span>
                {copiedType === 'invite' &&
                  'คัดลอกข้อความและลิงก์แล้ว สามารถวางส่งใน LINE กลุ่มแผนกได้ทันที'}
                {copiedType === 'url' &&
                  'คัดลอกลิงก์เรียบร้อยแล้ว สามารถวางส่งให้เพื่อนในแผนกได้ทันที'}
                {copiedType === 'qr-saved' &&
                  'ดาวน์โหลดภาพ QR Code (PNG) แล้ว สามารถส่งเข้า LINE หรือพิมพ์ติดบอร์ดแผนกได้ทันที'}
              </span>
            </div>
          )}

          {/* QR Code Card Section */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
            <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs shrink-0">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code สำหรับเข้าสู่ระบบตารางเวร"
                  className="w-40 h-40 block"
                />
              ) : qrError ? (
                <div className="w-40 h-40 flex items-center justify-center text-center text-xs text-rose-600 px-3">
                  {qrError}
                </div>
              ) : (
                <div className="w-40 h-40 bg-slate-100 rounded-lg animate-pulse" />
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
              <div>
                <div className="text-xs font-bold text-slate-900">
                  สแกน QR เพื่อเปิดระบบลงเวร
                </div>
                <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                  ให้เพื่อนในแผนกใช้กล้องมือถือหรือ LINE สแกน QR นี้เพื่อเข้าสู่ระบบได้ทันที
                  หรือดาวน์โหลดเป็นภาพ PNG เพื่อส่งเข้ากลุ่ม LINE / ติดบอร์ดหน้าห้อง
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadQrCard()}
                disabled={!qrDataUrl || downloadingQr}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{downloadingQr ? 'กำลังสร้างภาพ...' : 'ดาวน์โหลดภาพ QR (PNG)'}</span>
              </button>
            </div>
          </div>

          {/* Direct Shareable Link */}
          <div className="space-y-1.5">
            <label htmlFor="share-app-url" className="block text-xs font-semibold text-slate-700">
              ลิงก์เข้าใช้งานสำหรับบุคลากรในแผนก
            </label>
            <div className="flex items-center gap-2">
              <input
                id="share-app-url"
                type="text"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 px-3 py-2 text-xs font-mono text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedType === 'url' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    คัดลอกแล้ว
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    คัดลอกลิงก์
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Ready-to-paste LINE Group Message */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-slate-500" />
                ข้อความพร้อมลิงก์สำหรับส่งใน LINE กลุ่ม
              </span>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-teal-800 bg-white hover:bg-teal-50 border border-teal-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                {copiedType === 'invite' ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    คัดลอกข้อความแล้ว
                  </>
                ) : (
                  <>
                    <MessageSquareText className="w-3.5 h-3.5" />
                    คัดลอกข้อความ + ลิงก์
                  </>
                )}
              </button>
            </div>
            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-sans leading-relaxed bg-white border border-slate-200 rounded-lg p-2.5">
              {inviteMessage}
            </pre>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg cursor-pointer"
            >
              ปิด
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
