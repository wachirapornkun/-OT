# Security Specification — Nursing Shift Roster & OT Reimbursement System

## 1. Data Invariants
1. **PII Isolation**: User email addresses reside exclusively in `/userAccounts/{uid}`. Only the owning UID or an Admin may read a `/userAccounts/{uid}` document. No public or department-wide read is permitted.
2. **Self-Assigned Privilege Prevention**: Users creating their own `/userAccounts/{uid}` document MUST set `role == 'staff'` and `linkedStaffId == ''`, and CANNOT modify `role` on update. Admin privileges are verified strictly via `/admins/{uid}` or the verified bootstrapped admin email (`email_verified == true`).
3. **One-to-One Atomic Self-Binding (Anti-Hijack & Anti-Multi-Claim)**: A non-admin user may claim at most ONE unclaimed `/staff/{staffId}` profile (`existing().ownerUid == ''`) or create at most ONE new `/staff/{staffId}` profile with `ownerUid == request.auth.uid`, atomically synchronized with `/userAccounts/{uid}.linkedStaffId` via `getAfter()`/`existsAfter()`. Once claimed, non-admins cannot unbind or claim another colleague's profile; only Admin can unlink/reassign.
4. **Master Gate & Self-Only Shift Entry Enforcement**: A `/months/{monthId}/entries/{staffId}` document CANNOT be created unless both parent `/months/{monthId}` and referenced `/staff/{staffId}` exist. Non-admin staff can ONLY create or update shift entries for the single `staffId` where `/staff/{staffId}.ownerUid == request.auth.uid` AND parent `/months/{monthId}.status == 'open'`. Admin users may create or update shift entries for any staff member.
5. **Terminal State Locking**: Only Admin may lock or unlock `/months/{monthId}.status`. Once set to `'locked'`, non-admin users are strictly blocked from creating or updating shift entries for that month.
6. **Temporal Integrity & Immutability**: All `createdAt` and `updatedAt` timestamps must match `request.time`. Fields `createdAt`, `monthId`, `staffId`, and `uid` are strictly immutable after creation.
7. **Strict Schema & Bounds**: All documents enforce `hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` per action on update, bounded string lengths, bounded map sizes (`<= 31`), and regex-validated IDs (`^[a-zA-Z0-9_\-]+$`).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Shadow Field Injection on UserAccount**: Creating `/userAccounts/{uid}` with extra field `isAdmin: true`. -> Expect `PERMISSION_DENIED`.
2. **Self-Role Escalation**: Creating `/userAccounts/{uid}` with `role: "admin"` as a regular user. -> Expect `PERMISSION_DENIED`.
3. **PII Cross-Read**: Authenticated user B attempting `get` on `/userAccounts/{userA_uid}`. -> Expect `PERMISSION_DENIED`.
4. **Email Spoofing Attack**: Request with `token.email == 'wachirapornkun@gmail.com'` but `token.email_verified == false` attempting Admin write on `/admins/attacker`. -> Expect `PERMISSION_DENIED`.
5. **ID Poisoning Attack**: Creating `/staff/{200_char_invalid_id}` with oversize ID string. -> Expect `PERMISSION_DENIED`.
6. **Orphaned Shift Entry**: Creating `/months/2099-12/entries/staff_1` when `/months/2099-12` does not exist. -> Expect `PERMISSION_DENIED`.
7. **Cross-Staff Shift Tampering**: Staff user B attempting to create or update `/months/2026-10/entries/staff_A` where `staff_A.ownerUid == userA` or `staff_A.ownerUid == ''`. -> Expect `PERMISSION_DENIED`.
8. **Locked Month Bypass**: Staff user A attempting to update their own entry under `/months/2026-10` when `status == 'locked'`. -> Expect `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: Creating a shift entry with `createdAt` set to a client-chosen past timestamp instead of `request.time`. -> Expect `PERMISSION_DENIED`.
10. **Multi-Claim / Unbind Bypass**: Staff user A (who already owns `staff_A`) attempting to clear `userAccounts/{userA}.linkedStaffId` or claim a second unclaimed profile `staff_B`. -> Expect `PERMISSION_DENIED`.
11. **Value Poisoning on Shift Map Size**: Submitting `mainShifts` with 40 keys (> 31 days) or non-map payload. -> Expect `PERMISSION_DENIED`.
12. **Profile Hijack & Unauthorized Delete Attack**: User B attempting to overwrite `ownerUid` on already-claimed `/staff/staff_A` (`ownerUid == userA`) or delete `/staff/staff_A`. -> Expect `PERMISSION_DENIED`.
