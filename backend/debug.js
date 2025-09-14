const dotenv = require('dotenv'); 
dotenv.config({ path: __dirname + '/.env' }); 
console.log('FEE_WALLET:', process.env.FEE_WALLET); 
