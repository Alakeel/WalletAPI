const express = require('express');
const { initDatabase } = require('./database');
const walletRoutes = require('./routes/wallet');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

initDatabase();
app.use('/api/wallet', walletRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});