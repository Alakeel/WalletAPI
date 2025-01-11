const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { initDatabase } = require('./database');
const walletRoutes = require('./routes/wallet');

const app = express();
app.use(express.json());
app.use(helmet());
app.use(cors());

const PORT = process.env.PORT || 3000;

initDatabase();

app.use('/api/wallet', walletRoutes);

app.use('/api', (req, res, next) => {
  res.send('Welcome to the wallet API');
});

app.use((req, res, next) => {
  res.status(403).send('Forbidden');
});

app.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}/api`);
});