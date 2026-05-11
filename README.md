# enPathEduBE

Education module backend for the [enPath](https://enpath.ai) AI career intelligence platform. Manages education history, AI-generated pathway waypoints, provider matches, and share cards.

Part of the enPath platform — see [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed route and model documentation.

## Tech Stack

- **Runtime:** Node.js 20
- **Framework:** Express
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Infrastructure:** Google Cloud Run, Cloud Build
- **Auth:** JWT (shared secret with enPathJobsBE)

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

**Production URL:** `https://enpath-edu-be-285173621267.us-central1.run.app`

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
```
