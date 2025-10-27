// backend/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const newsRouter = require('./routes/news');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // allow frontend to call backend
app.use(express.json());

app.use('/api/news', newsRouter);

// simple health route
app.get('/', (req, res) => res.send({ ok: true, msg: 'Flash news backend running' }));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
