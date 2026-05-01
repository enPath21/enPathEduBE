const express = require('express');
const cors = require('cors');
require('./config/mongoose');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/edu', require('./routes/ciaRoutes'));
app.use('/api/education', require('./routes/educationRoutes'));
app.use('/api/education', require('./routes/waypointRoutes'));
app.use('/api/activity', require('./routes/activityRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/health', require('./routes/healthRoutes'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`enPathEduBE running on ${PORT}`));
