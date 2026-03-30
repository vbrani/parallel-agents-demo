/**
 * Email notification module for the users feature.
 *
 * sendNotification logs the outgoing email to the console and returns a
 * receipt object. Replace the console.log with a real mail transport
 * (e.g. nodemailer, SendGrid) when ready for production.
 */

function sendNotification(email, subject, message) {
  console.log(`[EMAIL] To: ${email} | Subject: ${subject} | Message: ${message}`);
  return {
    sent: true,
    to: email,
    subject,
    timestamp: new Date().toISOString(),
  };
}

module.exports = { sendNotification };
