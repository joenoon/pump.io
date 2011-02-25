(function() {
  var Pump, express, path, pump, sys;
  path = require('path');
  require.paths.unshift(path.join(__dirname, "..", "..", "app", "realtime", "node_modules"));
  sys = require('sys');
  express = require('express');
  Pump = require('../lib/pump.io');
  pump = Pump.create({
    cluster_name: 'testcluster',
    server_sweeper: true,
    port: 3001,
    host: '0.0.0.0'
  });
  pump.server.use(express.staticProvider("" + __dirname + "/public"));
  pump.useAll(Pump.core_listeners);
  pump.useAll(Pump.db_listeners);
  pump.useAll(Pump.stub_listeners);
  pump.use('serversSweeped', 'serversSweeped', function() {
    this.socket.broadcast({
      type: 'serversSweeped',
      data: {}
    });
  });
  pump.listen();
}).call(this);
