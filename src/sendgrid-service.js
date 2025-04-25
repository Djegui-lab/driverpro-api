const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendNotification = async (type, recipient, data) => {
  const templates = {
    client_confirm: 'd-template-client-confirm',
    client_cancel: 'd-template-client-cancel',
    driver_confirm: 'd-template-driver-confirm',
    driver_cancel: 'd-template-driver-cancel'
  };

  const msg = {
    to: recipient.email,
    from: 'reservations@driverpro-chauffeur.site',
    templateId: templates[`${recipient.role}_${type}`],
    dynamicTemplateData: {
      ...data,
      reservation_id: data.reservationId.substring(0, 8)
    }
  };

  await sgMail.send(msg);
};

module.exports = { sendNotification };