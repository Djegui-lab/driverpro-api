// Charger les variables d'environnement
require('dotenv').config();

// Importer les dépendances
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const express = require('express');

// Initialiser Express (important pour tourner sur Heroku)
const app = express();
const PORT = process.env.PORT || 3000;

// Initialiser Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

// Initialiser SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Préparer les templates email (confirmation / annulation)
const emailTemplates = {
  driver_confirm: {
    subject: 'Course confirmée par votre chauffeur',
    sendgridTemplateId: 'd-81602ae7361f4254b28d4ca883226242',
  },
  driver_cancel: {
    subject: 'Annulation de votre course',
    sendgridTemplateId: 'd-a4ddb97407384b4fbb9b631ac4e35d57',
  }
};

// Référence à Firestore
const db = admin.firestore();

// Fonction pour gérer les changements de statut de réservation
const handleReservationStatusChange = async (reservationId, reservationData) => {
  try {
    // Récupérer les infos du chauffeur
    const driverDoc = await db.collection('drivers').doc(reservationData.driverId).get();
    const driverData = driverDoc.data();

    if (!driverData) {
      console.error(`Pas de données trouvées pour le chauffeur ${reservationData.driverId}`);
      return;
    }

    // Préparer les données pour l'email
    const emailData = {
      reservationId: reservationId.substring(0, 8),
      clientName: reservationData.client?.name || 'Client',
      driverName: driverData.name || 'Votre chauffeur',
      driverPhone: driverData.phone || 'Non disponible',
      date: reservationData.date?.toDate() || new Date(),
      trip: reservationData.trip || { from: 'Non spécifié', to: 'Non spécifié' },
      price: reservationData.price || 0
    };

    // Déterminer quel template utiliser
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
        templateId: template.sendgridTemplateId,
        dynamic_template_data: {
          clientName: emailData.clientName,
          driverName: emailData.driverName,
          reservationId: emailData.reservationId,
          date: emailData.date.toLocaleString('fr-FR'),
          trip: emailData.trip,
          price: emailData.price.toFixed(2),
          driverPhone: emailData.driverPhone
        }
      };

      await sgMail.send(msg);
      console.log(`✅ Email envoyé pour la réservation ${reservationId}`);
    } else {
      console.warn(`⚠️ Aucune adresse email client ou template non trouvé pour la réservation ${reservationId}`);
    }
  } catch (error) {
    console.error('❌ Erreur dans handleReservationStatusChange:', error);
    throw error;
  }
};

// Fonction pour écouter les changements Firestore
const setupReservationListener = () => {
  console.log('🔄 Mise en place de l\'écouteur Firestore...');

  return db.collection('reservations')
    .where('status', 'in', ['confirmed', 'cancelled'])
    .onSnapshot(
      async (snapshot) => {
        const changes = snapshot.docChanges();

        for (const change of changes) {
          if (change.type === 'modified') {
            const newData = change.doc.data();
            const previousData = change.doc.previous?.data(); // Utilisation de previous.data()

            if (!previousData) {
              console.warn(`⚠️ Aucune donnée précédente disponible pour ${change.doc.id}`);
              continue;
            }

            // Vérifier si le statut a changé
            if (newData.status !== previousData.status) {
              try {
                await handleReservationStatusChange(change.doc.id, newData);
              } catch (error) {
                console.error(`Erreur lors du traitement de la réservation ${change.doc.id}:`, error);
              }
            }
          }
        }
      },
      (error) => {
        console.error('🔥 Erreur Firestore:', error);
        // Essayer de relancer l'écouteur après 5 secondes
        setTimeout(setupReservationListener, 5000);
      }
    );
};

// Lancer l'écouteur Firestore
let reservationListener = setupReservationListener();

// Capturer les erreurs critiques
process.on('uncaughtException', (error) => {
  console.error('🚨 Erreur non capturée:', error);
  if (reservationListener) reservationListener();
  setTimeout(() => {
    reservationListener = setupReservationListener();
  }, 5000);
});

// Endpoint de vérification Heroku
app.get('/', (req, res) => {
  res.status(200).send('✅ Service DriverPro Notifications actif.');
});

// Lancer le serveur Express
app.listen(PORT, () => {
  console.log(`🚀 Service DriverPro Notifications en ligne sur le port ${PORT}`);
});
