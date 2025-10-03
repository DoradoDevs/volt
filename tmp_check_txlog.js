const mongoose = require('./backend/node_modules/mongoose');
const dotenv = require('./backend/node_modules/dotenv');
const TxLog = require('./backend/src/models/txlog');
const env = dotenv.config({ path: './backend/.env' }).parsed || {};
(async () => {
  await mongoose.connect(process.env.MONGO_URI || env.MONGO_URI);
  const docs = await TxLog.find({ userId: '68d829021234f8af5960c214' }).sort({ _id: -1 }).limit(10).lean();
  console.log(docs.map(({ action, status, error, createdAt, txid }) => ({ action, status, error, createdAt, txid })));
  await mongoose.disconnect();
})();
