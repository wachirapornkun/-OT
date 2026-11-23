import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = 'ระบบไม่สามารถเชื่อมต่อหรือบันทึกข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendly = 'บัญชีของคุณไม่มีสิทธิ์ดำเนินการในส่วนนี้ หรือตารางเวรเดือนนี้ถูกล็อกแล้ว';
      } else if (this.state.message.includes('Quota exceeded')) {
        friendly = 'โควต้าการใช้งานฐานข้อมูลรายวันเต็มแล้ว โควต้าจะรีเซ็ตในวันถัดไป';
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 text-red-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">
                  เกิดข้อผิดพลาดในการโหลดข้อมูล
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">{friendly}</p>
              </div>
            </div>
            <details className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <summary className="cursor-pointer font-medium text-slate-700">
                รายละเอียดทางเทคนิค
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-[11px]">
                {this.state.message}
              </pre>
            </details>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                รีโหลดหน้าเว็บ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
