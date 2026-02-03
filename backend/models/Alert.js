const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  videoName: {
    type: String,
    required: true
  },
  behavior: {
    type: String, // 'Fighting', 'Assault', 'Normal'
    required: true
  },
  riskLevel: {
    type: String, // 'High', 'Medium', 'Low'
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    default: 'Pending' // 'Pending', 'Verified'
  },
  sourceDetails: {
    type: Object // Optional metadata
  },
  videoPath: {
    type: String // Path to recorded evidence
  },
  location: {
    lat: Number,
    lon: Number
  },
  hiddenFromUser: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('Alert', AlertSchema);
