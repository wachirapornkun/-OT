import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  MessageSquareText,
  QrCode,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { DEFAULT_DEPARTMENT_SETTINGS } from '../types/roster';
import { mapFirebaseAuthError, normalizeLoginIdentifier } from '../utils/authHelpers';
import {
  buildInviteMessage,
  copyTextToClipboard,
  downloadQrPosterPng,
  getShareableAppUrl,
} from './ShareLinkModal';
import firebaseConfig from '../../firebase-applet-config.json';

type AuthMode = 'login' | 'register';

export const AuthLoginView: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [providerDisabled, setProviderDisabled] = useState(false);

  // QR Code & Shareable Link state right on the Login screen
  const shareUrl = useMemo(() => getShareableAppUrl(), []);
  const inviteMessage = useMemo(
    () =>
      buildInviteMessage(
        DEFAULT_DEPARTMENT_SETTINGS.departmentName,
        DEFAULT_DEPARTMENT_SETTINGS.hospitalName,
        shareUrl,
      ),
    [shareUrl],
  );
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<'none' | 'url' | 'invite' | 'qr-saved'>('none');
  const [downloadingQr, setDownloadingQr] = useState(false);

  useEffect(() => {
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
  }, [shareUrl]);

  const firebaseProvidersUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setProviderDisabled(false);
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setProviderDisabled(false);

    const normalized = normalizeLoginIdentifier(username);
    if (!normalized.ok) {
      setErrorMsg(normalized.error);
      return;
    }

    if (password.length < 6) {
      setErrorMsg('รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setErrorMsg('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, normalized.email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, normalized.email, password);
        const finalDisplayName = displayName.trim().slice(0, 120) || normalized.displayUsername;
        await updateProfile(cred.user, { displayName: finalDisplayName });
      }
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      setErrorMsg(mapped.message);
      setProviderDisabled(mapped.isProviderDisabled);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setProviderDisabled(false);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      setErrorMsg(mapped.message);
    } finally {
      setBusy(false);
    }
  };

  const showTemporaryCopied = (type: 'url' | 'invite' | 'qr-saved') => {
    setCopiedType(type);
  };

  const handleCopyUrl = async () => {
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) showTemporaryCopied('url');
  };

  const handleCopyInvite = async () => {
    const ok = await copyTextToClipboard(inviteMessage);
    if (ok) showTemporaryCopied('invite');
  };

  const handleDownloadQr = async () => {
    if (!qrDataUrl || downloadingQr) return;
    setDownloadingQr(true);
    try {
      await downloadQrPosterPng({
        qrDataUrl,
        departmentName: DEFAULT_DEPARTMENT_SETTINGS.departmentName,
        hospitalName: DEFAULT_DEPARTMENT_SETTINGS.hospitalName,
        shareUrl,
      });
      showTemporaryCopied('qr-saved');
    } finally {
      setDownloadingQr(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl space-y-6">
        {/* Hospital Identity Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-700 text-white shadow-sm mb-1">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-950 tracking-tight">
            ระบบตารางเวรและเบิกจ่ายค่าเวร OT
          </h1>
          <p className="text-sm font-medium text-teal-800">
            {DEFAULT_DEPARTMENT_SETTINGS.departmentName}
          </p>
          <p className="text-xs text-slate-500">{DEFAULT_DEPARTMENT_SETTINGS.hospitalName}</p>
        </div>

        {/* Two-Column Grid: Login Form + Easy QR & Link Share Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left: Auth Card */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            {/* Mode Tabs */}
            <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`py-3 text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'border-teal-700 text-teal-800 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <LogIn className="w-4 h-4" />
                เข้าสู่ระบบ
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`py-3 text-sm font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer ${
                  mode === 'register'
                    ? 'border-teal-700 text-teal-800 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <UserPlus className="w-4 h-4" />
                สมัครใช้งานใหม่
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Username / Email */}
                <div className="space-y-1.5">
                  <label htmlFor="auth-username" className="block text-xs font-semibold text-slate-700">
                    ชื่อผู้ใช้ (User) หรือ อีเมล
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-username"
                      type="text"
                      required
                      autoComplete="username"
                      maxLength={120}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="เช่น nurse01 หรืออีเมลของคุณ"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                  {mode === 'register' && (
                    <p className="text-[11px] text-slate-500">
                      ใช้ภาษาอังกฤษ ตัวเลข จุด (.) ขีดล่าง (_) หรือขีดกลาง (-) ความยาว 3–40 ตัวอักษร
                    </p>
                  )}
                </div>

                {/* Display Name (Register Only) */}
                {mode === 'register' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-displayname"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      ชื่อ - สกุล (สำหรับแสดงในระบบ)
                    </label>
                    <input
                      id="auth-displayname"
                      type="text"
                      maxLength={120}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="เช่น น.ส.สมหญิง ใจดี (ไม่บังคับ)"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900 placeholder:text-slate-400"
                    />
                  </div>
                )}

                {/* Password */}
                <div className="space-y-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-700">
                    รหัสผ่าน (Password)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={128}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="กรอกรหัสผ่านอย่างน้อย 6 ตัวอักษร"
                      className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password (Register Only) */}
                {mode === 'register' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      ยืนยันรหัสผ่าน
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="auth-confirm-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        maxLength={128}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="กรอกรหัสผ่านอีกครั้ง"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {errorMsg && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                    {providerDisabled && (
                      <div className="pl-6 pt-1 border-t border-red-200/80 text-slate-700 space-y-1">
                        <div className="font-semibold text-slate-900">
                          วิธีเปิดใช้งาน User/Password ใน Firebase Console (ทำครั้งเดียว):
                        </div>
                        <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                          <li>
                            เปิดหน้า{' '}
                            <a
                              href={firebaseProvidersUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-teal-700 font-semibold underline"
                            >
                              Firebase Authentication → Sign-in method
                            </a>
                          </li>
                          <li>คลิก Add new provider → เลือก Email/Password</li>
                          <li>กดเปิดสวิตช์ Enable ตัวแรก แล้วกด Save</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2">
                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {mode === 'login' ? (
                    <>
                      <LogIn className="w-4 h-4" />
                      {busy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      {busy ? 'กำลังสร้างบัญชี...' : 'สร้างบัญชีและเข้าสู่ระบบ'}
                    </>
                  )}
                </button>

                {/* Optional Google Sign-in Divider */}
                <div className="relative py-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-[11px]">
                    <span className="bg-white px-2.5 text-slate-400">หรือ</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                  className="w-full py-2 px-4 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  เข้าสู่ระบบด้วยบัญชี Google
                </button>
              </div>
            </form>
          </div>

          {/* Right: Share QR Code & Link Panel */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    QR Code &amp; ลิงก์ส่งให้เพื่อนในแผนก
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    สแกนหรือคัดลอกส่งเข้ากลุ่ม LINE ได้ทันที
                  </p>
                </div>
              </div>

              {copiedType !== 'none' && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    {copiedType === 'url' && 'คัดลอกลิงก์แล้ว วางส่งให้เพื่อนได้เลย'}
                    {copiedType === 'invite' && 'คัดลอกข้อความพร้อมลิงก์แล้ว ส่งใน LINE กลุ่มได้เลย'}
                    {copiedType === 'qr-saved' && 'ดาวน์โหลดภาพ QR Code (PNG) เรียบร้อยแล้ว'}
                  </span>
                </div>
              )}

              {/* Centered QR Box */}
              <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
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

                <button
                  type="button"
                  onClick={() => void handleDownloadQr()}
                  disabled={!qrDataUrl || downloadingQr}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-teal-800 bg-white hover:bg-teal-50 border border-teal-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{downloadingQr ? 'กำลังสร้างภาพ...' : 'ดาวน์โหลดภาพ QR (PNG)'}</span>
                </button>
              </div>

              {/* Direct Shareable Link */}
              <div className="space-y-1.5">
                <label
                  htmlFor="login-share-url"
                  className="block text-xs font-semibold text-slate-700"
                >
                  ลิงก์เข้าใช้งานระบบ
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="login-share-url"
                    type="text"
                    readOnly
                    value={shareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-0 px-2.5 py-2 text-[11px] font-mono text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedType === 'url' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        แล้ว
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        คัดลอก
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Copy Full LINE Message Button */}
            <button
              type="button"
              onClick={handleCopyInvite}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              {copiedType === 'invite' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-700" />
                  คัดลอกข้อความ + ลิงก์ส่ง LINE แล้ว
                </>
              ) : (
                <>
                  <MessageSquareText className="w-3.5 h-3.5 text-teal-700" />
                  คัดลอกข้อความ + ลิงก์ (ส่ง LINE กลุ่ม)
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-400">
          สำหรับบุคลากร {DEFAULT_DEPARTMENT_SETTINGS.departmentName} เท่านั้น
        </p>
      </div>
    </div>
  );
};
