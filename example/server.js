(function() {
  var Pump, core_listeners, db_listeners, express, pump, stub_listeners;
  express = require('express');
  Pump = require('../lib/pump.io');
  core_listeners = require('../lib/pump.io/core_listeners.js');
  db_listeners = require('../lib/pump.io/db_listeners.js');
  stub_listeners = require('../lib/pump.io/stub_listeners.js');
  pump = Pump.create(process.sparkEnv);
  pump.server.use(express.staticProvider("" + __dirname + "/public"));
  pump.useAll(core_listeners);
  pump.useAll(db_listeners);
  pump.useAll(stub_listeners);
  pump.emit('serverOnline', pump.server_id);
  module.exports = pump.server;
}).call(this);
