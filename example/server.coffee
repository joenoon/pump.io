path = require 'path'
require.paths.unshift path.join(__dirname, "..", "..", "app", "realtime", "node_modules")

sys = require 'sys'
express = require 'express'
Pump = require '../lib/pump.io'

pump = Pump.create
  cluster_name: 'testcluster'
  server_sweeper: true
  port: 3001
  host: '0.0.0.0'

pump.server.use express.staticProvider("#{__dirname}/public")

pump.useAll(Pump.core_listeners)
pump.useAll(Pump.db_listeners)
pump.useAll(Pump.stub_listeners)    # comment this one out and add your own instead
pump.use 'serversSweeped', 'serversSweeped', ->
  @socket.broadcast { type: 'serversSweeped', data: {} }
  return

pump.listen()


# repl = require("repl").start()
# repl.context.sys = require('sys')
# repl.context.pump = pump
