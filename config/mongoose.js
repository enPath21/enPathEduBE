const mongoose = require('mongoose');

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://REDACTED@enpathcluster0.ibzri.mongodb.net/enPathEdu';

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected — enPathEdu'))
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

module.exports = mongoose;
