const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  connectionTimeout: 5000, // 5 second timeout
  greetingTimeout: 5000,
});

const sendEmail = async (to, subject, text) => {
  await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
};

module.exports = { sendEmail };