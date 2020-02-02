'use strict';
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongo = require('mongodb');
const mongoose = require('mongoose');
const autoIncrement = require('mongoose-auto-increment');

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

var connection = mongoose.createConnection(process.env.MLAB_URI, {
  useNewUrlParser: true, 
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false
});

// Auto Increment
autoIncrement.initialize(connection);

// Setting up Schema and Model
const userSchema = new mongoose.Schema({
  username: {type: String, required: true, unique: true},  
});
userSchema.plugin(autoIncrement.plugin, 'User');
const User = connection.model('User', userSchema);
// Exercise
const exerciseSchema = new mongoose.Schema({
  userId: {type: Number, required: true},
  description: {type: String, required: true},
  duration: {type: Number, required: true},
  date: {type: Date, default: Date.now}
});
const Exercise = connection.model('Exercise', exerciseSchema);

// Better format Date output
var dateRegexp = /[\w\d]+\s[\w\d]+\s[\w\d]+\s[\w\d]+/ig;

// Create User Form
app.post("/api/exercise/new-user", function(req, res) {
  if (req.body.username.length >= 5) {
    let newUser = new User({username: req.body.username});
    newUser.save(function(err, data) {
      if (err) {
        console.log(err.code);
        if (err.code === 11000) res.send('Username already taken...');
      } else {
        res.json({username: data.username, _id: data._id});  
      }
    });      
  } else {
    return res.status(400).send('Username needs to be at least 5 characters long...');
  }
});

// Add Exercise Form
app.post('/api/exercise/add', async function(req, res) {
  // Check if valid userId
  let user = await User.findById(req.body.userId, function(err, data) {
    if (err) res.send('unknown _id');     
    return data; 
  });
  if (!user) {
    res.send("User ID does not exist");
  } else {
    // Check Date
    let date;  
    if (req.body.date) {
      date = new Date(req.body.date);    
    } else {
      date = new Date();
    }
    let newExercise = new Exercise({
      userId: req.body.userId,
      description: req.body.description,
      duration: req.body.duration,
      date: date
    });
    newExercise.save(function(err, data) {
      if (err) return console.error(err);
      res.json({
        _id: data.userId,
        username: user.username,
        description: data.description,
        duration: data.duration,
        date: data.date.toString().match(dateRegexp)[0]
      });
    });
  }  
});

// Get User Info
app.get("/api/exercise/log", async function(req, res) {
  // Return if userId not provided
  if (!req.query.userId) {
    res.send("Invalid userId...");  
  } else {
    let user = await User.findById(req.query.userId, function(err, data) {
      if (err) res.send('unknown _id');     
      return data; 
    });
    if (user) {
      let params = {};
      params.userId = req.query.userId;
      // FROM provided
      if (req.query.from) {
        params.date = {};
        params.date.$gte = new Date(req.query.from);
      }
      // TO provided
      if (req.query.to) {
        // Use TO only if FROM was provided before
        if (params.date) {
          params.date.$lte = new Date(req.query.to);
        }
      }
      // Limit (Use limit only if FROM and TO were provided)
      let limit = req.query.limit && params.date ? params.date.$lte && params.date.$gte ? parseInt(req.query.limit) : 0 : 0;
      // Execute query
      Exercise.find(params).limit(limit).select({_id: 0, userId: 0, __v: 0}).lean().exec(function (err, data) {
        if (err) console.error(err);
        //console.log(data)
        if (data.length) {
          // Format Date output        
          data.forEach(item => {
            item.date = item.date.toString().match(dateRegexp)[0];          
          });
          // Output
          res.json({
            _id: user._id,
            username: user.username,
            count: data.length,
            log: data
          });
        } else {
          res.status(404).send('Not Found...');
        }
      }); 
    } else {
      res.send('User does not exist...');
    }
  }
});

// Get all users
app.get("/api/exercise/users", function(req, res) {
  let users = User.find({}, function(err, data) {
    if (err) return console.error(err);
    res.json(data);
  })
});

// Static assets
app.use(express.static('public'));
// Index
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
});
