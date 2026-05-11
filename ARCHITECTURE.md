# enPathEduBE — Architecture

## Service Purpose

enPathEduBE is the backend service for enPath's Education module. It manages a user's education history (degrees, certifications, bootcamps, courses) and AI-generated education pathway waypoints produced by the Education Intelligence Agent (EIA). It follows the same patterns as enPathJobsBE.

**Module color:** teal `#286a69`

## Database

- **Engine:** MongoDB (via Mongoose)
- **Database name:** `enPathEdu`
- **Cluster:** enPathCluster0 (MongoDB Atlas)

## Key Models

| Model | Collection | Purpose |
|---|---|---|
| `EducationItem` | `educationitems` | Stores a user's education history — degrees, certs, bootcamps, courses. Sourced from resume parsing or manual entry. |
| `EducationWaypoint` | `educationwaypoints` | AI-generated pathway steps recommended by EIA. Each waypoint represents a credential the user could pursue, with projected ROI, tuition, and delivery details. |
| `EduEnrolledRecord` | `eduentrolledrecords` | Tracks which education matches a user has marked as enrolled. |
| `EduShareCard` | `edusharecards` | Token-based public share cards for the education pathway. Expires after 30 days. |
| `AuditLog` | `auditlogs` | Activity log for tracking user and agent actions (same schema as enPathJobsBE). |

## Route Structure

All routes are mounted under `/api/edu` unless noted otherwise.

| Prefix | File | Description |
|---|---|---|
| `/api/edu/history` | `educationRoutes.js` | CRUD for education history items + bulk resume upsert (`/from-resume`) |
| `/api/edu/waypoints` | `waypointRoutes.js` | Waypoint retrieval, feedback (accept/decline/undesired), dates, matches, insert, regenerate, and EIA proxy routes |
| `/api/edu/cia-preferences` | `ciaRoutes.js` | Proxy CRUD for CIA goal preferences (GET/POST/PATCH/DELETE) |
| `/api/edu/share` | `shareRoutes.js` | Share card generation and public fetch |
| `/api/edu/matches` | `enrolledRoutes.js` | Enrolled-match tracking (GET enrolled list, PATCH enrolled status) |
| `/api/edu/agent` | `agentRoutes.js` | EIA recalc proxy (`POST /agent/recalc/:userId`) |
| `/api/activity` | `activityRoutes.js` | Audit log GET / POST / DELETE / PATCH read |
| `/api/auth` | `authRoutes.js` | JWT validation stub (auth happens via enPathJobsBE) |
| `/health` | `healthRoutes.js` | Health check endpoint |

## Key Endpoints

### Education History
- `GET  /api/edu/history/:userId` — fetch all education items
- `POST /api/edu/history/:userId` — create education item
- `PUT  /api/edu/history/:id` — update education item
- `DELETE /api/edu/history/:id` — delete education item
- `POST /api/edu/history/from-resume` — bulk upsert from resume parser (API key or JWT)

### Waypoints
- `GET  /api/edu/waypoints/:userId` — fetch active waypoints (excludes declined/replaced/undesired)
- `POST /api/edu/waypoints/run/:userId` — trigger EIA pathway run
- `PATCH /api/edu/waypoints/:id/feedback` — accept, decline (hard delete), or undesired (pattern learning + EIA replacement)
- `PATCH /api/edu/waypoints/:id/dates` — update user start/end dates and completion status
- `PATCH /api/edu/waypoints/:id/regenerate` — mark undesired + request EIA replacement
- `POST /api/edu/waypoints/insert` — insert a new EIA-generated waypoint between accepted waypoints
- `POST /api/edu/waypoints/replace-with-suggestion` — proxy to EIA for waypoint replacement
- `POST /api/edu/waypoints/regenerate-one` — proxy to EIA with CIA feedback
- `POST /api/edu/waypoints/undo-replace` — restore a replaced waypoint
- `GET  /api/edu/waypoints/matches/:userId` — fetch education provider matches from EIA

### CIA Preferences (proxy to enPathCIA)
- `GET    /api/edu/cia-preferences/:userId` — fetch CIA preferences
- `POST   /api/edu/cia-preferences/:userId/goals` — create a goal
- `PATCH  /api/edu/cia-preferences/:userId/goals/:goalId` — update a goal
- `DELETE /api/edu/cia-preferences/:userId/goals/:goalId` — archive a goal

### Share
- `POST /api/edu/share/generate` — create a share token (authenticated). Returns `shareUrl` pointing to `/edu-card/:token`.
- `GET  /api/edu/share/:shareToken` — public fetch of share card data (no auth required)

### Enrolled Matches
- `GET   /api/edu/matches/enrolled/:userId` — list enrolled matches
- `PATCH /api/edu/matches/:matchId/enrolled` — toggle enrolled status

### Agent
- `POST /api/edu/agent/recalc/:userId` — proxy recalc request to EIA

## Billing Integration

EIA runs cost **7c x pricingMultiplier** per run. Before each EIA run is triggered, the caller charges the user's balance via:

```
POST /api/billing/charge-internal
Header: x-internal-key
```

This endpoint lives on enPathJobsBE. If the user has insufficient balance, a `402 INSUFFICIENT_BALANCE` error is returned and the run is blocked.

## Auth Patterns

1. **JWT Bearer** (`authMiddleware.js`) — Verifies `Authorization: Bearer <token>` using a shared JWT secret. Used for user-facing endpoints.
2. **API Key OR JWT** (`apiKeyOrAuth.js`) — Accepts either `x-api-key` header (for internal service-to-service calls from enPathJobsBE, EIA, CIA) or a JWT Bearer token. Used for endpoints called by both users and internal services.

## External Service Dependencies

| Service | Env Var | Purpose |
|---|---|---|
| **EIA** (Education Intelligence Agent) | `EIA_URL` / `EDU_AGENT_URL` | AI agent that generates education pathway waypoints. enPathEduBE proxies requests to EIA for pathway generation, waypoint insertion, replacement, and regeneration. |
| **CIA** (Career Intelligence Agent) | `CIA_URL` | Provides career context, goals, and feedback that inform EIA pathway decisions. enPathEduBE proxies CIA preference CRUD. |
| **enPathJobsBE** | — | The core backend. Users authenticate through enPathJobsBE; this service validates the same JWT tokens. enPathJobsBE also calls the `/from-resume` endpoint to push parsed education data, and handles billing via `/api/billing/charge-internal`. |
