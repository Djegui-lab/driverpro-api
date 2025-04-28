require('dotenv').config();
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const express = require('express');

// Initialisation Express (nécessaire pour Heroku)
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Configuration SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Templates d'emails avec les ID de modèles spécifiques
const emailTemplates = {
  driver_confirm: {
    subject: 'Course confirmée par votre chauffeur',
    sendgridTemplateId: 'd-81602ae7361f4254b28d4ca883226242',  // ID de modèle SendGrid pour confirmation
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #3498db;">Confirmation de votre course</h2>
        <p>Bonjour ${data.clientName},</p>
        
        <p>Votre chauffeur <strong>${data.driverName}</strong> a confirmé votre course #${data.reservationId}.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Détails de la course :</h3>
          <p><strong>Date :</strong> ${new Date(data.date).toLocaleString('fr-FR')}</p>
          <p><strong>Départ :</strong> ${data.trip.from}</p>
          <p><strong>Destination :</strong> ${data.trip.to}</p>
          <p><strong>Prix :</strong> ${data.price.toFixed(2)} €</p>
        </div>
        
        <p>Vous pouvez contacter votre chauffeur au ${data.driverPhone} si nécessaire.</p>
        
        <p>Cordialement,<br>L'équipe DriverPro</p>
        
        <div style="margin-top: 30px; font-size: 12px; color: #777;">
          <p>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
      </div>
    `
  },
  driver_cancel: {
    subject: 'Annulation de votre course',
    sendgridTemplateId: 'd-a4ddb97407384b4fbb9b631ac4e35d57 ',  // ID de modèle SendGrid pour annulation
    html: (data) => `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e74c3c;">Annulation de votre course</h2>
        <p>Bonjour ${data.clientName},</p>
        
        <p>Nous regrettons de vous informer que votre chauffeur <strong>${data.driverName}</strong> a dû annuler votre course #${data.reservationId}.</p>
        
        <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Détails de la course annulée :</h3>
          <p><strong>Date :</strong> ${new Date(data.date).toLocaleString('fr-FR')}</p>
          <p><strong>Départ :</strong> ${data.trip.from}</p>
          <p><strong>Destination :</strong> ${data.trip.to}</p>
        </div>
        
        <p>Nous vous invitons à effectuer une nouvelle réservation.</p>
        
        <p>Cordialement,<br>L'équipe DriverPro</p>
        
        <div style="margin-top: 30px; font-size: 12px; color: #777;">
          <p>Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
        </div>
      </div>
    `
  }
};

// Écouteur Firestore pour les changements de statut
const db = admin.firestore();
const setupReservationListener = () => {
  const reservationsRef = db.collection('reservations');

  return reservationsRef
    .where('status', 'in', ['confirmed', 'cancelled'])
    .onSnapshot(async (snapshot) => {
      const changes = snapshot.docChanges();
      
      for (const change of changes) {
        if (change.type === 'modified') {
          const newData = change.doc.data();
          const previousData = change.doc.previous.data();

          // Vérifier si le statut a changé
          if (newData.status !== previousData.status) {
            try {
              await handleReservationStatusChange(change.doc.id, newData);
              console.log(`Traitement réussi pour la réservation ${change.doc.id}`);
            } catch (error) {
              console.error(`Erreur traitement réservation ${change.doc.id}:`, error);
            }
          }
        }
      }
    }, (error) => {
      console.error('Erreur Firestore:', error);
      // Réessayer après un délai en cas d'erreur
      setTimeout(setupReservationListener, 5000);
    });
};

// Gestion du changement de statut
const handleReservationStatusChange = async (reservationId, reservationData) => {
  try {
    // Récupérer les infos du chauffeur
    const driverDoc = await db.collection('drivers').doc(reservationData.driverId).get();
    const driverData = driverDoc.data();

    // Préparer les données pour l'email
    const emailData = {
      reservationId: reservationId.substring(0, 8),
      clientName: reservationData.client?.name || 'Client',
      driverName: driverData?.name || 'Votre chauffeur',
      driverPhone: driverData?.phone || 'non disponible',
      date: reservationData.date?.toDate() || new Date(),
      trip: reservationData.trip || { from: 'Non spécifié', to: 'Non spécifié' },
      price: reservationData.price || 0
    };

    // Envoyer l'email avec le bon ID de modèle
    const templateType = `driver_${reservationData.status}`;
    const template = emailTemplates[templateType];

    if (template && reservationData.client?.email) {
      const msg = {
        to: reservationData.client.email,
        from: {
          email: process.env.SENDGRID_FROM_EMAIL,
          name: 'DriverPro Notifications'
        },
        subject: template.subject,
        templateId: template.sendgridTemplateId, // Utilisation de l'ID de modèle spécifique
        dynamic_template_data: emailData // Passer les données dynamiques au modèle
      };

      await sgMail.send(msg);
      console.log(`Email envoyé pour la réservation ${reservationId}`);
    }
  } catch (error) {
    console.error('Erreur dans handleReservationStatusChange:', error);
    throw error;
  }
};

// Démarrer l'écouteur
let reservationListener = setupReservationListener();

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
  console.error('Erreur non capturée:', error);
  // Redémarrer l'écouteur après une erreur critique
  if (reservationListener) reservationListener();
  setTimeout(() => {
    reservationListener = setupReservationListener();
  }, 5000);
});

// Endpoint health check pour Heroku
app.get('/', (req, res) => {
  res.status(200).send('Service de notifications DriverPro actif');
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`Service de notifications actif sur le port ${PORT}`);
});
