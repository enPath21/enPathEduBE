# enPath AI Context — Education Module (enPathEduBE)

> Read ENPATH-CONTEXT.md first, then this file.
> Last updated: 2026-05-13

---

## What EduBE Does
Manages a user's education history (degrees, certifications, bootcamps, courses) and AI-generated education pathway waypoints produced by the Education Intelligence Agent (EIA). Follows the same patterns as enPathJobsBE.

## Color Scheme
- Primary: teal `#286a69`

## Cloud Run
- Service: `enpath-edu-be`
- URL: `https://enpath-edu-be-285173621267.us-central1.run.app`
- Latest deployed revision: `00028-jdz`

## Database
- Engine: MongoDB Atlas
- Database name: `enPathEdu`
- Key models: `EducationItem`, `EducationWaypoint`, `EduEnrolledRecord`, `EduShareCard`, `AuditLog`

## Key Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/edu/history/:userId` | Fetch all education history items |
| `POST /api/edu/history/from-resume` | Bulk upsert from resume parser (API key or JWT) |
| `GET /api/edu/waypoints/:userId` | Fetch active waypoints (excludes declined/replaced/undesired) |
| `POST /api/edu/waypoints/run/:userId` | Trigger EIA pathway run |
| `PATCH /api/edu/waypoints/:id/feedback` | Accept, decline, or mark undesired |
| `POST /api/edu/waypoints/insert` | Insert exactly 1 new EIA-generated waypoint |
| `POST /api/edu/agent/recalc/:userId` | Proxy recalc request to EIA |
| `GET /api/edu/cia-preferences/:userId` | Fetch CIA preferences (proxy to enPathCIA) |
| `POST /api/edu/share/generate` | Create a share token |
| `GET /api/edu/share/:shareToken` | Public share card fetch (no auth) |

## Waypoint Behavior Rules
- Agents NEVER delete or modify existing waypoints on re-run
- Auto-run = recalc numbers only, never touch pathway items
- Agents add exactly 1 item when user requests new suggestion
- Education waypoints are date-chained (unlike community waypoints which are concurrent)

## Resume Replace Rule
- New resume wipes Education history only
- PATHWAYS (education waypoints) DO NOT CHANGE on resume replace

## Auth Patterns
1. **JWT Bearer** (`authMiddleware.js`) — user-facing endpoints
2. **API Key OR JWT** (`apiKeyOrAuth.js`) — endpoints called by both users and internal services
3. `x-api-key` = `INTERNAL_API_KEY` for service-to-service calls

## Billing
- EIA runs cost **7c × pricingMultiplier** per run
- Charge via `POST /api/billing/charge-internal` on enPathJobsBE before triggering EIA
- If user has insufficient balance → 402 INSUFFICIENT_BALANCE → block the run

## External Dependencies
| Service | Env Var | Purpose |
|---|---|---|
| EIA | `EIA_URL` / `EDU_AGENT_URL` | Pathway generation, waypoint insertion, replacement, regeneration |
| CIA | `CIA_URL` | Career goals context for EIA personalization |
| enPathJobsBE | — | JWT validation, billing endpoint, resume parsing push |

## Module Boundary
- Education data stays in enPathEduBE only
- Never read from or write to Jobs, Financial, or Community collections
