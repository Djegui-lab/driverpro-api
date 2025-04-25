require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Bienvenue sur l'API DriverPro 🚗✨");
});

app.use('/api/reservations', require('./routes/reservations'));

// Démarrer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur API VTC démarré sur le port ${PORT}`);
});
