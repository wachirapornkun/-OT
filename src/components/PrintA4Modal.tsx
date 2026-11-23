import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  A4ColorMode,
  A4MarginMm,
  A4Orientation,
  A4PrintOptions,
  A4ScaleMode,
  buildA4PrintDocumentHtml,
  calculateAutoFitScalePercent,
  downloadPrintableA4File,
  printElementAsA4,
} from '../utils/a4Print';

interface PrintA4ModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  getSourceElement: () => HTMLElement | null;
  defaultOrientation?: A4Orientation;
}

const SCALE_OPTIONS: { value: A4ScaleMode; label: string }[] = [
  { value: 'auto', label: 'พอดีหน้า A4 อัตโนมัติ' },
  { value: 100, label: '100%' },
  { value: 90, label: '90%' },
  { value: 85, label: '85%' },
  { value: 80, label: '80%' },
  { value: 75, label: '75%' },
];

const MARGIN_OPTIONS: { value: A4MarginMm; label: string }[] = [
  { value: 5, label: 'แคบ (5 มม.)' },
  { value: 8, label: 'มาตรฐาน (8 มม.)' },
  { value: 12, label: 'กว้าง (12 มม.)' },
];

export const PrintA4Modal: React.FC<PrintA4ModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  getSourceElement,
  defaultOrientation = 'landscape',
}) => {
  const [orientation, setOrientation] = useState<A4Orientation>(defaultOrientation);
  const [marginMm, setMarginMm] = useState<A4MarginMm>(8);
  const [scaleMode, setScaleMode] = useState<A4ScaleMode>('auto');
  const [colorMode, setColorMode] = useState<A4ColorMode>('color');
  const [printing, setPrinting] = useState(false);
  const [printSentNotice, setPrintSentNotice] = useState(false);
  const [downloadedNotice, setDownloadedNotice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOrientation(defaultOrientation);
      setPrintSentNotice(false);
      setDownloadedNotice(false);
    }
  }, [isOpen, defaultOrientation, documentTitle]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const options: A4PrintOptions = useMemo(
    () => ({
      title: documentTitle,
      orientation,
      marginMm,
      scaleMode,
      colorMode,
    }),
    [documentTitle, orientation, marginMm, scaleMode, colorMode],
  );

  const previewData = useMemo(() => {
    if (!isOpen) return null;
    const sourceEl = getSourceElement();
    if (!sourceEl) return null;
    const autoScale = calculateAutoFitScalePercent(sourceEl, orientation, marginMm);
    const { html, effectiveScalePercent } = buildA4PrintDocumentHtml(sourceEl, options, false);
    return {
      html,
      autoScale,
      effectiveScalePercent,
    };
  }, [isOpen, getSourceElement, orientation, marginMm, options]);

  if (!isOpen) return null;

  const handlePrintNow = async () => {
    const sourceEl = getSourceElement();
    if (!sourceEl) return;
    setPrinting(true);
    setPrintSentNotice(false);
    try {
      await printElementAsA4(sourceEl, options);
      setPrintSentNotice(true);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadPrintable = () => {
    const sourceEl = getSourceElement();
    if (!sourceEl) return;
    downloadPrintableA4File(sourceEl, options);
    setDownloadedNotice(true);
    setTimeout(() => setDownloadedNotice(false), 3000);
  };

  const handleResetDefaults = () => {
    setOrientation(defaultOrientation);
    setMarginMm(8);
    setScaleMode('auto');
    setColorMode('color');
  };

  return (
    <div
      className="no-print fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="เชื่อมต่อเครื่องพิมพ์และตั้งค่าหน้ากระดาษ A4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
              <Printer className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                เชื่อมต่อเครื่องพิมพ์ (Printer) — พิมพ์ขนาด A4
              </h3>
              <p className="text-xs text-slate-500 truncate">
                เอกสาร: {documentTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="ปิดหน้าต่างพิมพ์"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Settings Panel + Live A4 Sheet Preview */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Settings Column */}
          <div className="lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 p-5 overflow-y-auto space-y-5 bg-slate-50/60">
            {/* Orientation */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                ขนาดและแนวกระดาษ (A4)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation('landscape')}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-lg border text-left transition-colors cursor-pointer ${
                    orientation === 'landscape'
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div>A4 แนวนอน</div>
                  <div
                    className={`text-[10px] font-normal mt-0.5 ${
                      orientation === 'landscape' ? 'text-teal-100' : 'text-slate-500'
                    }`}
                  >
                    297 × 210 มม. (แนะนำ)
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('portrait')}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-lg border text-left transition-colors cursor-pointer ${
                    orientation === 'portrait'
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div>A4 แนวตั้ง</div>
                  <div
                    className={`text-[10px] font-normal mt-0.5 ${
                      orientation === 'portrait' ? 'text-teal-100' : 'text-slate-500'
                    }`}
                  >
                    210 × 297 มม.
                  </div>
                </button>
              </div>
            </div>

            {/* Scale Mode */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-800">
                  มาตราส่วนพอดีหน้า A4
                </label>
                {previewData && (
                  <span className="text-[11px] font-mono font-semibold text-teal-700 tabular-nums">
                    ใช้จริง {previewData.effectiveScalePercent}%
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {SCALE_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setScaleMode(opt.value)}
                    className={`px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      opt.value === 'auto' ? 'col-span-2' : ''
                    } ${
                      scaleMode === opt.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.value === 'auto' && previewData
                      ? `${opt.label} (${previewData.autoScale}%)`
                      : opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Margin */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                ระยะขอบกระดาษ
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {MARGIN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMarginMm(opt.value)}
                    className={`px-2 py-2 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                      marginMm === opt.value
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color Mode */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-800">
                โหมดสีสำหรับเครื่องพิมพ์
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setColorMode('color')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    colorMode === 'color'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  พิมพ์สี (แนะนำ)
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('grayscale')}
                  className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    colorMode === 'grayscale'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  ขาว-ดำ
                </button>
              </div>
            </div>

            {/* Helpful Printer Tip */}
            <div className="p-3 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1.5 leading-relaxed">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                วิธีเลือกเครื่องพิมพ์ / บันทึก PDF
              </div>
              <p>
                กดปุ่ม <strong>สั่งพิมพ์ออกเครื่องพิมพ์ (A4)</strong> เพื่อเปิดหน้าต่างเครื่องพิมพ์ของระบบ
                สามารถเลือกเครื่องพิมพ์ USB / Wi-Fi / เครือข่าย หรือเลือก <strong>Save as PDF</strong> ได้ทันที
              </p>
              <p className="text-slate-500">
                แนะนำเปิดตัวเลือก <strong>Background graphics</strong> ในหน้าต่างเครื่องพิมพ์เพื่อให้แถบวันหยุดสีแดงแสดงครบถ้วน
              </p>
            </div>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              รีเซ็ตค่าหน้ากระดาษเริ่มต้น
            </button>
          </div>

          {/* Right Live A4 Preview Area */}
          <div className="flex-1 min-w-0 bg-slate-200/80 p-4 sm:p-6 overflow-auto flex flex-col items-center">
            <div className="w-full flex items-center justify-between text-xs text-slate-600 mb-3 max-w-4xl">
              <span className="font-medium">
                ตัวอย่างก่อนพิมพ์บนกระดาษ A4 ({orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'})
              </span>
              <span className="font-mono text-[11px] text-slate-500">
                ขอบ {marginMm} มม. · มาตราส่วน {previewData?.effectiveScalePercent ?? 100}%
              </span>
            </div>

            {previewData ? (
              <div
                className={`bg-white shadow-xl border border-slate-300 overflow-hidden w-full ${
                  orientation === 'landscape'
                    ? 'max-w-[860px] aspect-[297/210]'
                    : 'max-w-[560px] aspect-[210/297]'
                }`}
              >
                <iframe
                  title="ตัวอย่างเอกสาร A4 ก่อนพิมพ์"
                  srcDoc={previewData.html}
                  className="w-full h-full border-0 bg-white"
                />
              </div>
            ) : (
              <div className="w-full max-w-xl py-16 bg-white border border-dashed border-slate-300 rounded-xl text-center text-sm text-slate-500">
                ไม่พบพื้นที่เอกสารสำหรับพิมพ์ในหน้านี้ กรุณาเลือกหน้าตารางเวรหรือตารางเบิกเงิน OT
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {printSentNotice ? (
              <span className="inline-flex items-center gap-1.5 text-teal-700 font-medium">
                <Check className="w-4 h-4" />
                ส่งคำสั่งไปยังหน้าต่างเครื่องพิมพ์แล้ว (หากไม่เด้งขึ้น ให้ใช้ปุ่มดาวน์โหลดไฟล์ A4 ด้านขวา)
              </span>
            ) : (
              <span>รองรับเครื่องพิมพ์ A4 ทุกยี่ห้อ (USB / Wi-Fi / LAN / AirPrint / PDF)</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadPrintable}
              disabled={!previewData}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              {downloadedNotice ? (
                <Check className="w-3.5 h-3.5 text-teal-600" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {downloadedNotice ? 'ดาวน์โหลดไฟล์ A4 แล้ว' : 'ดาวน์โหลดไฟล์ A4 พร้อมพิมพ์'}
            </button>

            <button
              type="button"
              onClick={() => void handlePrintNow()}
              disabled={printing || !previewData}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4" />
              {printing ? 'กำลังเชื่อมต่อเครื่องพิมพ์...' : 'สั่งพิมพ์ออกเครื่องพิมพ์ (A4)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
