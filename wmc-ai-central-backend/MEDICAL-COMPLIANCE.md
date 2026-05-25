# WMC AI Central Backend — Medical Compliance & Audit Architecture

**Location:** `D:\WMC-AI\wmc-ai-central-backend`  
**Status:** Mock audit active · Prisma-ready schema designed · Production hardening pending  
**Version:** 1.0 · 2026-05-20

**Related files:**

- `src/modules/audit/` — routes, controller, service
- `src/shared/utils/audit-logger.js` — `logAuditEvent()` helper
- `src/shared/mocks/audit-mock-data.js` — seed data
- `prisma/schema.prisma` — `AuditLog` model (core schema)

---

## Why audit logs matter in healthcare

Healthcare facilities handle sensitive patient data (PHI — Protected Health Information). Every action performed on patient records, clinical notes, and escalations must be traceable to:

1. **A specific user** — who performed the action
2. **A specific time** — when it occurred
3. **A specific system** — which module and record were affected

Audit logs are the foundation of healthcare compliance, legal defence, and clinical accountability. They are **append-only** by design — entries are never deleted or modified.

---

## Tracked actions

| Action constant | Trigger | Module |
|----------------|---------|--------|
| `LOGIN` | Successful user login | auth |
| `LOGOUT` | User logout | auth |
| `TOKEN_REFRESHED` | JWT refresh completed | auth |
| `VIEW_PATIENT` | Single patient record opened | patients |
| `CREATE_PATIENT` | New patient admitted | patients |
| `UPDATE_PATIENT` | Patient record edited | patients |
| `DISCHARGE_PATIENT` | Patient discharged | patients |
| `VIEW_NURSING_RECORD` | Nursing record list viewed | nursing |
| `CREATE_NURSING_RECORD` | New vitals/nursing entry | nursing |
| `UPDATE_NURSING_RECORD` | Nursing entry edited | nursing |
| `CREATE_REHAB_RECORD` | New rehab session recorded | rehab |
| `UPDATE_REHAB_RECORD` | Rehab progress updated | rehab |
| `CREATE_ALERT` | Clinical alert raised | alerts |
| `ACKNOWLEDGE_ALERT` | Alert reviewed and acknowledged | alerts |
| `ESCALATION_TRIGGERED` | Doctor/supervisor escalation | alerts |
| `COMPLETE_TASK` | Nursing/clinical task marked done | tasks |
| `CREATE_TASK` | New task assigned | tasks |
| `SEND_FAMILY_UPDATE` | WhatsApp/Telegram family message | notifications |
| `SEND_NOTIFICATION` | Any outbound notification | notifications |
| `CREATE_HANDOVER_LOG` | Shift handover recorded | nursing |
| `CREATE_CRM_LEAD` | New inquiry/lead registered | crm |
| `BOOK_APPOINTMENT` | Appointment booked | crm |
| `VIEW_AUDIT_LOGS` | Audit log accessed (meta-audit) | audit |
| `DEACTIVATE_USER` | User account deactivated | users |

---

## AuditLog data model

```prisma
model AuditLog {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String?  @map("user_id") @db.Uuid   -- Who (nullable for system events)
  userRole    String   @map("user_role")            -- Role at time of action
  action      String                                -- e.g. CREATE_NURSING_RECORD
  module      String                                -- e.g. nursing
  targetId    String?  @map("target_id")            -- Affected record ID
  targetType  String?  @map("target_type")          -- e.g. Patient, NursingRecord
  description String?                               -- Human-readable summary
  ipAddress   String?  @map("ip_address")           -- Source IP
  createdAt   DateTime @default(now())               -- Immutable timestamp

  @@index([userId])
  @@index([action])
  @@index([module])
  @@index([createdAt])
  @@schema("core")
}
```

**Key constraints for production:**
- No `updatedAt` — audit records are immutable
- No `deletedAt` — audit records are never soft-deleted
- Separate PostgreSQL role with INSERT-only permission on `core.audit_logs`

---

## logAuditEvent() usage

```javascript
const { logAuditEvent, AUDIT_ACTIONS } = require('../../shared/utils/audit-logger')

// In a controller (req carries user context automatically):
logAuditEvent(req, {
  action:      AUDIT_ACTIONS.CREATE_NURSING_RECORD,
  module:      'nursing',
  targetId:    patientId,
  targetType:  'Patient',
  description: `Nursing record created for patient ${patientId}`,
})

// Outside a request context (scheduled job, system event):
logAuditEvent(null, {
  userId:      'system',
  userRole:    'system',
  action:      'NIGHTLY_BACKUP_COMPLETED',
  module:      'system',
  description: 'Automated nightly backup completed successfully',
})
```

Context auto-extracted from `req`:
- `userId` ← `req.user.id`
- `userRole` ← `req.user.role`
- `ipAddress` ← `req.ip` or `x-forwarded-for` header

---

## API endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/audit/logs` | admin, supervisor | Full log list with filters |
| `GET` | `/api/v1/audit/summary` | admin, supervisor | Aggregated counts |
| `GET` | `/api/v1/audit/actions` | admin, supervisor | Canonical action constants |

### Query filters (`GET /audit/logs`)

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `module` | string | `nursing` | Filter by module |
| `action` | string | `CREATE_NURSING_RECORD` | Filter by action |
| `userId` | string | UUID | Filter by user |
| `userRole` | string | `nurse` | Filter by role |
| `targetId` | string | `P-1001` | Filter by record |
| `from` | ISO date | `2026-05-20T00:00:00Z` | Start of range |
| `to` | ISO date | `2026-05-20T23:59:59Z` | End of range |
| `limit` | number | `50` | Max results (500 cap) |

---

## Healthcare accountability

### Role accountability

Every audit entry records the **role at the time of action** — not just the user. This matters because:
- A user's role may change over time (nurse promoted to supervisor)
- Legal investigations need the role that was active during the incident

| Role | Accountability |
|------|---------------|
| `admin` | Full system actions, user management, data exports |
| `supervisor` | Shift oversight, alert acknowledgements, escalations |
| `nurse` | Nursing records, task completion, patient vitals |
| `therapist` | Rehab session records, progress updates |
| `doctor` | Patient escalations, clinical overrides |
| `frontdesk` | Family communications, appointment booking |

### Legal traceability

Audit logs provide an evidence chain for:

1. **Medication / treatment disputes** — prove when a nursing record was created and by whom
2. **Fall incidents** — show when fall-risk alert was raised, who acknowledged it, and when
3. **Family communication records** — prove that next-of-kin was notified and when
4. **Escalation timelines** — document when a doctor was alerted to critical vitals
5. **Discharge timing** — track when discharge was initiated and approved

### Incident investigation support

When an adverse event occurs, investigators can:

```bash
# Timeline for a specific patient
GET /api/v1/audit/logs?targetId=P-1001&from=2026-05-20T06:00:00Z&to=2026-05-20T23:59:59Z

# All actions by a specific nurse
GET /api/v1/audit/logs?userId=<nurse-id>&module=nursing

# All escalations today
GET /api/v1/audit/logs?action=ESCALATION_TRIGGERED
```

### Supervisor monitoring

Supervisors can use audit logs to:
- Verify that nurses completed required 2-hourly tasks
- Confirm alert acknowledgements occurred within response windows
- Review family communication history before family meetings
- Identify unusual login times or access patterns

---

## Future HIPAA-like considerations

> WMC AI operates under Malaysian healthcare data law (PDPA 2010) and internal clinical governance. The following principles align with international best practices including HIPAA (US) and ISO 27799 (healthcare information security).

| Principle | Requirement | Implementation plan |
|-----------|-------------|-------------------|
| **Minimum necessary access** | Users see only what their role requires | Role guards on all domain routes (Phase 4) |
| **Audit trail completeness** | Every PHI access logged | `logAuditEvent` in all controllers |
| **Immutable records** | Logs cannot be altered | Append-only Prisma model, no update/delete routes |
| **Data retention** | Audit logs kept ≥ 7 years | Archive strategy to cold storage (Phase 8) |
| **Breach notification** | Suspicious access patterns detected | Anomaly detection on audit stream (Phase 9) |
| **Access revocation** | Deactivated users cannot access data | `isActive` check on every login + `DEACTIVATE_USER` audit |
| **Encryption at rest** | PHI encrypted in DB | PostgreSQL TDE or column-level encryption (Phase 6) |
| **Transport security** | HTTPS for all API calls | TLS enforcement + HSTS header (Phase 5) |

---

## Append-only enforcement (production)

In production, the database role that runs the API should have **INSERT-only permission** on `core.audit_logs`:

```sql
-- Create a restricted audit writer role
CREATE ROLE wmc_audit_writer;
GRANT INSERT ON core.audit_logs TO wmc_audit_writer;
-- NEVER grant UPDATE or DELETE

-- API service connects as wmc_app_user
-- wmc_app_user has wmc_audit_writer privileges
GRANT wmc_audit_writer TO wmc_app_user;
```

This means even if application code attempts `prisma.auditLog.update()`, the database will reject it at the permission level.

---

## Meta-audit: auditing the auditors

Accessing audit logs is itself audited:

```
GET /api/v1/audit/logs
  → triggers: logAuditEvent(req, { action: 'VIEW_AUDIT_LOGS', module: 'audit' })
```

This ensures that even administrators cannot browse logs without leaving a trace.

---

## Production hardening checklist

```
[ ] 1. Wire audit.repository.js to Prisma (replace in-memory AUDIT_STORE)
[ ] 2. Create core.audit_logs migration
[ ] 3. Set INSERT-only DB permission for audit table
[ ] 4. Add logAuditEvent() to all remaining controllers (rehab, crm, handover)
[ ] 5. Add log rotation / archive for records older than 90 days to cold storage
[ ] 6. Add anomaly detection alerts (e.g. > 50 patient views in 5 minutes)
[ ] 7. Add export endpoint: GET /audit/export?format=csv (admin only)
[ ] 8. Add audit log signing (HMAC each entry) to detect tampering
[ ] 9. Integrate with SIEM or log aggregation (Elasticsearch / Datadog)
[ ] 10. Conduct annual audit access review (who can see audit logs)
```

---

*Append-only. Immutable. Role-attributed. Time-stamped. — Healthcare compliance foundation.*
