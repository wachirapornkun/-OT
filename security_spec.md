# Security Specification — Nursing Shift Roster & OT Reimbursement System

## 1. Data Invariants
1. **PII Isolation**: User email addresses reside exclusively in `/userAccounts/{uid}`. Only the owning UID or an Admin may read a `/userAccounts/{uid}` document. No public or department-wide read is permitted.
2. **Self-Assigned Privilege Prevention**: Users creating their own `/userAccounts/{uid}` document MUST set `role == 'staff'` and CANNOT modify `role` on update. Admin privileges are verified strictly via `/admins/{uid}` or the verified bootstrapped admin email (`email_verified == true`).
3. **Master Gate & Relational Integrity**: A `/months/{monthId}/entries/{staffId}` document CANNOT be created unless both parent `/months/{monthId}` and referenced `/staff/{staffId}` exist.
4. **Ownership & Self-Entry Enforcement**: Non-admin staff can only create or edit shift entries for a `staffId` whose `/staff/{staffId}.ownerUid == request.auth.uid`, and ONLY while parent `/months/{monthId}.status == 'open'`.
5. **Terminal State Locking**: Once an Admin sets `/months/{monthId}.status = 'locked'`, non-admin users are strictly blocked from modifying shift entries for that month.
6. **Temporal Integrity & Immutability**: All `createdAt` and `updatedAt` timestamps must match `request.time`. Fields `createdAt`, `monthId`, `staffId`, and `uid` are strictly immutable after creation.
7. **Strict Schema & Bounds**: All documents enforce `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` per action on update, bounded string lengths, bounded map sizes (`<= 31`), and regex-validated IDs (`^[a-zA-Z0-9_\-]+$`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on UserAccount**: Creating `/userAccounts/{uid}` with extra field `isAdmin: true`. -> Expect `PERMISSION_DENIED`.
2. **Self-Role Escalation**: Creating `/userAccounts/{uid}` with `role: "admin"` as a regular user. -> Expect `PERMISSION_DENIED`.
3. **PII Cross-Read**: Authenticated user B attempting `get` on `/userAccounts/{userA_uid}`. -> Expect `PERMISSION_DENIED`.
4. **Email Spoofing Attack**: Request with `token.email == 'wachirapornkun@gmail.com'` but `token.email_verified == false` attempting Admin write on `/settings/department`. -> Expect `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: Creating `/staff/{1500_char_invalid_id}` with spaces or oversize ID string. -> Expect `PERMISSION_DENIED`.
6. **Orphaned Shift Entry**: Creating `/months/2099-12/entries/staff_1` when `/months/2099-12` does not exist. -> Expect `PERMISSION_DENIED`.
7. **Cross-Staff Shift Tampering**: Staff user B attempting to update `/months/2026-10/entries/staff_A` where `staff_A.ownerUid == userA`. -> Expect `PERMISSION_DENIED`.
8. **Locked Month Bypass**: Staff user A attempting to update their own entry under `/months/2026-10` when `status == 'locked'`. -> Expect `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Creating a shift entry with `createdAt` set to a client-chosen past timestamp instead of `request.time`. -> Expect `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Updating `/months/2026-10/entries/staff_A` while altering `createdAt` or `staffId`. -> Expect `PERMISSION_DENIED`.
11. **Value Poisoning on Map Size**: Submitting `mainShifts` with 50 keys (> 31 days) or non-map payload. -> Expect `PERMISSION_DENIED`.
12. **Profile Hijack Attack**: User B attempting to overwrite `ownerUid` on an already-claimed `/staff/staff_A` (`ownerUid == userA`). -> Expect `PERMISSION_DENIED`.
