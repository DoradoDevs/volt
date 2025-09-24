const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'volumeterminal@gmail.com', // Match your .env EMAIL_USER
    pass: 'bfhfjclaqiyogcha',         // Match your .env EMAIL_PASS
  },
});
transporter.verify((error, success) => {
  if (error) console.log('Error:', error);
  else console.log('Server is ready to send emails');
});