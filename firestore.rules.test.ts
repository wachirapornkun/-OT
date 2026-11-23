/**
 * Security Rules Verification Suite — Dirty Dozen Adversarial Payloads
 * Documents the expected PERMISSION_DENIED assertions against firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actor: { uid: string; email: string; emailVerified: boolean; isAdmin?: boolean };
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOW';
  mitigatingGate: string;
}

export const dirtyDozenTests: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on UserAccount',
    collectionPath: '/userAccounts/user_b',
    operation: 'create',
    actor: { uid: 'user_b', email: 'nurse@hospital.th', emailVerified: true },
    payload: {
      uid: 'user_b',
      email: 'nurse@hospital.th',
      displayName: 'Nurse B',
      linkedStaffId: '',
      role: 'staff',
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'isValidUserAccount -> data.keys().hasOnly([...]) rejects ghost field isAdmin',
  },
  {
    id: 2,
    name: 'Self-Role Escalation on UserAccount',
    collectionPath: '/userAccounts/user_b',
    operation: 'create',
    actor: { uid: 'user_b', email: 'nurse@hospital.th', emailVerified: true },
    payload: {
      uid: 'user_b',
      email: 'nurse@hospital.th',
      displayName: 'Nurse B',
      linkedStaffId: '',
      role: 'admin',
    },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'allow create enforces incoming().role == "staff" for non-admins',
  },
  {
    id: 3,
    name: 'PII Cross-Read on UserAccount',
    collectionPath: '/userAccounts/user_a',
    operation: 'get',
    actor: { uid: 'user_b', email: 'nurse@hospital.th', emailVerified: true },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'allow get restricts userAccounts to isOwner(uid) || isAdmin()',
  },
  {
    id: 4,
    name: 'Email Spoofing Attack (Unverified Admin Email)',
    collectionPath: '/settings/department',
    operation: 'update',
    actor: { uid: 'attacker', email: 'Wachirapornkun@gmail.com', emailVerified: false },
    payload: { rnOtRate: 99999 },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'isAdmin() mandates request.auth.token.email_verified == true',
  },
  {
    id: 5,
    name: 'ID Poisoning Attack on Staff Collection',
    collectionPath: `/staff/${'x'.repeat(200)}`,
    operation: 'create',
    actor: { uid: 'user_b', email: 'nurse@hospital.th', emailVerified: true },
    payload: { staffId: 'x'.repeat(200) },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'isValidId(staffId) limits ID to <= 64 chars matching ^[a-zA-Z0-9_-]+$',
  },
  {
    id: 6,
    name: 'Orphaned Shift Entry (Non-existent Parent Month)',
    collectionPath: '/months/2099-12/entries/staff_1',
    operation: 'create',
    actor: { uid: 'user_a', email: 'a@hospital.th', emailVerified: true },
    payload: { monthId: '2099-12', staffId: 'staff_1', ownerUid: 'user_a' },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'Master Gate checks exists(/databases/$(database)/documents/months/$(monthId))',
  },
  {
    id: 7,
    name: 'Cross-Staff Shift Tampering',
    collectionPath: '/months/2026-10/entries/staff_1',
    operation: 'update',
    actor: { uid: 'user_b', email: 'b@hospital.th', emailVerified: true },
    payload: { mainShifts: { '1': 'ช/บ' } },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'Relational check verifies staff/{staffId}.ownerUid == request.auth.uid',
  },
  {
    id: 8,
    name: 'Locked Month Bypass Attempt',
    collectionPath: '/months/2026-10/entries/staff_1',
    operation: 'update',
    actor: { uid: 'user_a', email: 'a@hospital.th', emailVerified: true },
    payload: { mainShifts: { '3': 'ช/บ' } },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'Terminal State Lock requires parent month status == "open" for non-admins',
  },
  {
    id: 9,
    name: 'Client Timestamp Forgery',
    collectionPath: '/months/2026-10/entries/staff_1',
    operation: 'create',
    actor: { uid: 'user_a', email: 'a@hospital.th', emailVerified: true },
    payload: { createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'Temporal Integrity mandates incoming().createdAt == request.time',
  },
  {
    id: 10,
    name: 'Immutable Field Mutation on Update',
    collectionPath: '/months/2026-10/entries/staff_1',
    operation: 'update',
    actor: { uid: 'user_a', email: 'a@hospital.th', emailVerified: true },
    payload: { staffId: 'staff_2', ownerUid: 'user_b' },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'affectedKeys().hasOnly(["mainShifts","nightShifts","workloadShifts","standbyShifts","updatedAt"])',
  },
  {
    id: 11,
    name: 'Value Poisoning on Shift Map Size',
    collectionPath: '/months/2026-10/entries/staff_1',
    operation: 'update',
    actor: { uid: 'user_a', email: 'a@hospital.th', emailVerified: true },
    payload: { mainShifts: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [String(i + 1), 'ช'])) },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'isValidShiftMap enforces data.mainShifts is map && data.mainShifts.size() <= 31',
  },
  {
    id: 12,
    name: 'Staff Profile Ownership Hijack',
    collectionPath: '/staff/staff_1',
    operation: 'update',
    actor: { uid: 'user_b', email: 'b@hospital.th', emailVerified: true },
    payload: { ownerUid: 'user_b' },
    expectedResult: 'PERMISSION_DENIED',
    mitigatingGate: 'Claim action requires existing().ownerUid == "" before allowing ownerUid assignment',
  },
];
