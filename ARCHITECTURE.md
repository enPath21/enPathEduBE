# enPathEduBE — Architecture

## Service Purpose

enPathEduBE is the backend service for enPath's Education module. It manages a user's education history (degrees, certifications, bootcamps, courses) and AI-generated education pathway waypoints produced by the Education Intelligence Agent (EIA). It follows the same patterns as enPathJobsBE.

## Database

- **Engine:** MongoDB (via Mongoose)
- **Database name:** `enPathEdu`
- **Cluster:** enPathCluster0 (MongoDB Atlas)

## Key Models

| Model | Collection | Purpose |
|---|---|---|
| `EducationItem` | `educationitems` | Stores a user's education history — degrees, certs, bootcamps, courses. Sourced from resume parsing or manual entry. |
| `EducationWaypoint` | `educationwaypoints` | AI-generated pathway steps recommended by EIA. Each waypoint represents a credential the user could pursue, with projected ROI, tuition, and delivery details. |
| `AuditLog` | `auditlogs` | Activity log for tracking user and agent actions (same schema as enPathJobsBE). |

## Route Structure

| Prefix | File | Description |
|---|---|---|
| `/api/education/history` | `educationRoutes.js` | CRUD for education history items + bulk resume upsert |
| `/api/education/waypoints` | `waypointRoutes.js` | Waypoint retrieval, feedback (accept/decline), and EIA proxy routes |
| `/api/activity` | `activityRoutes.js` | Audit log GET / POST / DELETE / PATCH read |
| `/api/auth` | `authRoutes.js` | JWT validation stub (auth happens via enPathJobsBE) |
| `/health` | `healthRoutes.js` | Health check endpoint |

## Auth Patterns

1. **JWT Bearer** (`authMiddleware.js`) — Verifies `Authorization: Bearer <token>` using a shared JWT secret. Used for user-facing endpoints.
2. **API Key OR JWT** (`apiKeyOrAuth.js`) — Accepts either `x-api-key` header (for internal service-to-service calls from enPathJobsBE, EIA, CIA) or a JWT Bearer token. Used for endpoints called by both users and internal services.

## External Service Dependencies

| Service | Env Var | Purpose |
|---|---|---|
| **EIA** (Education Intelligence Agent) | `EIA_URL` | AI agent that generates education pathway waypoints. enPathEduBE proxies requests to EIA for pathway generation, waypoint replacement, and regeneration. |
| **CIA** (Career Intelligence Agent) | `CIA_URL` | Provides career context and feedback that informs EIA pathway decisions. |
| **enPathJobsBE** | — | The jobs backend service. Users authenticate through enPathJobsBE; this service validates the same JWT tokens. enPathJobsBE also calls the `/from-resume` endpoint to push parsed education data. |
