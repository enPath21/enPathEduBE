# enPathEduBE

Education module backend for the [enPath](https://enpath-frontend-285173621267.us-central1.run.app) AI career intelligence platform. Manages education history, AI-generated pathway waypoints, provider matches, and share cards.

Part of the enPath platform — see [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed route and model documentation.

Cloud Run service: `enpath-edu-be`
Production: https://enpath-edu-be-285173621267.us-central1.run.app

## Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Express
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Infrastructure:** Google Cloud Run, Cloud Build
- **Auth:** JWT (shared secret with enPathJobsBE) + `x-api-key` for internal routes

## Module Role

enPathEduBE owns all education data for a user:

- **Education history** — degrees, certifications, bootcamps, in-progress credentials
- **Education waypoints** — AI-generated pathway suggestions (pending/accepted/declined)
- **Provider matches** — matched education providers for a waypoint
- **Enrolled records** — tracking of accepted/enrolled items
- **Share cards** — public education pathway share cards (tokenized, no auth)
- **Internal summary** — `GET /api/edu/internal/summary/:userId` consumed by Claire for education data context injection

## Pending Card Button Label

Pending education waypoint cards use **"Keep It"** (not "Sounds Good") on the accept button. All buttons are grey.

## Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default `8080`) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Shared JWT secret (same as enPathJobsBE) |
| `INTERNAL_API_KEY` | Key for service-to-service calls (EIA, CIA, enPathJobsBE) |
| `EIA_URL` | Education Intelligence Agent base URL |
| `EDU_AGENT_URL` | EIA base URL (used by agent recalc proxy) |
| `CIA_URL` | Career Intelligence Agent base URL |

## Local Development

```bash
npm install
# Set env vars (see above) — use a .env file or export directly
node server.js
# Server starts on http://localhost:8080
```

Health check: `GET /health`

## Deploy

Deploys automatically via Cloud Build on push to `main`. See `cloudbuild.yaml` for the pipeline — builds a Docker image, pushes to Artifact Registry, and deploys to Cloud Run (`enpath-edu-be`).

```bash
python3 /home/user/workspace/enpath-deploy.py edu-be
```

## Project Structure

```
server.js              # Express app entry point
config/
  mongoose.js          # MongoDB connection
middleware/
  authMiddleware.js    # JWT Bearer auth
  apiKeyOrAuth.js      # API key or JWT auth
models/
  educationItem.model.js
  educationWaypoint.model.js
  EduEnrolledRecord.js
  auditLog.model.js
routes/
  educationRoutes.js   # Education history CRUD
  waypointRoutes.js    # Waypoint operations + EIA proxy
  ciaRoutes.js         # CIA preference proxy
  shareRoutes.js       # Share card generation
  enrolledRoutes.js    # Enrolled match tracking
  agentRoutes.js       # EIA recalc proxy
  activityRoutes.js    # Audit log
  authRoutes.js        # Auth stub
  healthRoutes.js      # Health check
  internalRoutes.js    # Internal summary for Claire context injection
```

## Platform Context

enPathEduBE is one of four module backends. It communicates with:

- **enPathJobsBE** — for auth validation and billing charges
- **enPathCIA** — for goal preferences and personalization
- **EIA (Education Intelligence Agent)** — for waypoint generation and recalc
- **enPathJobsBE (Claire)** — via the internal summary endpoint (`GET /api/edu/internal/summary/:userId`)
