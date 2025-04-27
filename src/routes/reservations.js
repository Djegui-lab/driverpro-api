const express = require('express');
const router = express.Router();
const admin = require('../firebase-admin');
const { sendNotification } = require('../sendgrid-service');

const db = admin.firestore();

router.post('/:id/confirm', async (req, res) => {
  try {
    // Log les données de la requête et l'ID de la réservation
    console.log('Requête reçue pour la réservation ID:', req.params.id);
    console.log('Corps de la requête:', req.body);

    const reservationId = req.params.id;
    const driverId = req.body.driverId;

    // Vérifie si le driverId est bien présent
    if (!driverId) {
      return res.status(400).json({ error: 'driverId est requis dans le body' });
    }

    const reservationRef = db.collection('reservations').doc(reservationId);
    const driverRef = db.collection('drivers').doc(driverId);

    // Log les références Firestore pour vérifier que tout est bien configuré
    console.log('Référence de la réservation:', reservationRef);
    console.log('Référence du chauffeur:', driverRef);

    const [reservation, driver] = await Promise.all([
      reservationRef.get(),
      driverRef.get()
    ]);

    // Vérification de l'existence des documents
    if (!reservation.exists || !driver.exists) {
      console.log('Données introuvables pour la réservation ou le chauffeur');
      return res.status(404).json({ error: "Données introuvables" });
    }

    const reservationData = reservation.data();
    const driverData = driver.data();

    // Log les données récupérées
    console.log('Données de la réservation:', reservationData);
    console.log('Données du chauffeur:', driverData);

    // Envoi des notifications
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

    // Mise à jour du statut de la réservation
    await reservationRef.update({ status: 'confirmed' });

    console.log('Réservation confirmée avec succès');
    res.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la confirmation:", error);
    // Log l'erreur complète pour mieux comprendre ce qui a échoué
    res.status(500).json({ 
      error: error.response?.body?.errors || error.message 
    });
  }
});

module.exports = router;
