const express = require('express');
const router = express.Router();
const admin = require('../firebase-admin');
const { sendNotification } = require('../sendgrid-service');

const db = admin.firestore();

router.post('/:id/confirm', async (req, res) => {
  try {
    const reservationId = req.params.id;
    const reservationRef = db.collection('reservations').doc(reservationId);
    const driverRef = db.collection('drivers').doc(req.body.driverId);

    const [reservation, driver] = await Promise.all([
      reservationRef.get(),
      driverRef.get()
    ]);

    if (!reservation.exists || !driver.exists) {
      return res.status(404).json({ error: "Données introuvables" });
    }

    const reservationData = reservation.data();
    const driverData = driver.data();

    await Promise.all([
      sendNotification('confirm', 
        { email: reservationData.client.email, role: 'client' },
        { ...reservationData, driverName: driverData.name }
      ),
      sendNotification('confirm', 
        { email: driverData.email, role: 'driver' },
        { ...reservationData, clientName: reservationData.client.name }
      )
    ]);

    await reservationRef.update({ status: 'confirmed' });

    res.json({ success: true });
  } catch (error) {
    console.error("Erreur confirmation:", error);
    res.status(500).json({ 
      error: error.response?.body?.errors || error.message 
    });
  }
});

module.exports = router;