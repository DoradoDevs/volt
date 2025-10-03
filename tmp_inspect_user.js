const mongoose = require('./backend/node_modules/mongoose');
const dotenv = require('./backend/node_modules/dotenv');
const User = require('./backend/src/models/user');
const env = dotenv.config({ path: './backend/.env' }).parsed || {};
(async () => {
  await mongoose.connect(process.env.MONGO_URI || env.MONGO_URI);
  const user = await User.findById('68d829021234f8af5960c214').lean();
  console.log({
    running: user.running,
    tokenMint: user.tokenMint,
    activeWallets: user.activeWallets,
    subWalletCount: user.subWalletsEncrypted?.length,
    subPreview: user.subWalletsEncrypted?.slice(0,3)
  });
  await mongoose.disconnect();
})();
