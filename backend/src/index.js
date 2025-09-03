const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const routes = require('./routes');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI).then(() => console.log('Mongo connected'));

app.use('/api', routes);

app.listen(process.env.PORT, () => console.log(`Server on ${process.env.PORT}`));