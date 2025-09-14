const mongoose = require('mongoose');

const uri = 'mongodb+srv://volumeterminal_db_user:gGONNaxBxv33yC4Z@cluster0.uyz7vso.mongodb.net/volt?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(uri)
  .then(() => {
    console.log('Successfully connected to MongoDB Atlas');
    mongoose.connection.close();
  })
  .catch((err) => {
    console.error('Connection error:', err.message);
  });