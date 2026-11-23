export const INTERNAL_AUTH_DOMAIN = 'bangphli.local';

export type NormalizedLoginResult =
  | { ok: true; email: string; displayUsername: string }
  | { ok: false; error: string };

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Accepts either a plain username (e.g. "nurse01") or a full email address.
 * Plain usernames are deterministically mapped to "<username>@bangphli.local"
 * so staff can log in with User + Password via Firebase Authentication.
 */
export function normalizeLoginIdentifier(raw: string): NormalizedLoginResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'กรุณากรอกชื่อผู้ใช้ (User) หรืออีเมล' };
  }

  if (trimmed.includes('@')) {
    const lowerEmail = trimmed.toLowerCase();
    if (lowerEmail.length > 254 || !EMAIL_PATTERN.test(lowerEmail)) {
      return { ok: false, error: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }
    return {
      ok: true,
      email: lowerEmail,
      displayUsername: getDisplayUsername(lowerEmail),
    };
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error:
        'ชื่อผู้ใช้ต้องมี 3–40 ตัวอักษร ใช้ได้เฉพาะภาษาอังกฤษ (a-z), ตัวเลข (0-9), จุด (.), ขีดล่าง (_) หรือขีดกลาง (-)',
    };
  }

  const lowerUser = trimmed.toLowerCase();
  return {
    ok: true,
    email: `${lowerUser}@${INTERNAL_AUTH_DOMAIN}`,
    displayUsername: lowerUser,
  };
}

export function getDisplayUsername(email: string | null | undefined): string {
  if (!email) return '';
  const suffix = `@${INTERNAL_AUTH_DOMAIN}`;
  if (email.toLowerCase().endsWith(suffix)) {
    return email.slice(0, email.length - suffix.length);
  }
  return email;
}

export interface FriendlyAuthError {
  message: string;
  isProviderDisabled: boolean;
}

export function mapFirebaseAuthError(err: unknown): FriendlyAuthError {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง',
        isProviderDisabled: false,
      };
    case 'auth/email-already-in-use':
      return {
        message: 'ชื่อผู้ใช้นี้มีในระบบแล้ว กรุณาสลับไปที่แท็บ "เข้าสู่ระบบ" หรือตั้งชื่อผู้ใช้อื่น',
        isProviderDisabled: false,
      };
    case 'auth/weak-password':
      return {
        message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร',
        isProviderDisabled: false,
      };
    case 'auth/invalid-email':
      return {
        message: 'รูปแบบชื่อผู้ใช้หรืออีเมลไม่ถูกต้อง',
        isProviderDisabled: false,
      };
    case 'auth/too-many-requests':
      return {
        message: 'มีการลองเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
        isProviderDisabled: false,
      };
    case 'auth/network-request-failed':
      return {
        message: 'ไม่สามารถเชื่อมต่ออินเทอร์เน็ตได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่',
        isProviderDisabled: false,
      };
    case 'auth/popup-closed-by-user':
      return {
        message: 'ยกเลิกการเข้าสู่ระบบด้วยบัญชี Google',
        isProviderDisabled: false,
      };
    case 'auth/operation-not-allowed':
      return {
        message:
          'ยังไม่ได้เปิดใช้งานระบบเข้าสู่ระบบด้วย User/Password (Email/Password) ใน Firebase Console',
        isProviderDisabled: true,
      };
    case 'auth/requires-recent-login':
      return {
        message: 'กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้งก่อนเปลี่ยนรหัสผ่าน',
        isProviderDisabled: false,
      };
    default:
      return {
        message: 'ไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
        isProviderDisabled: false,
      };
  }
}
