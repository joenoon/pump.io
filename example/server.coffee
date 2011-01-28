sys = require 'sys'
express = require 'express'
Pump = require '../lib/pump.io'

pump = Pump.create
  cluster_name: 'testcluster'
  server_sweeper: true

pump.server.use express.staticProvider("#{__dirname}/public")

pump.useAll(Pump.core_listeners)
pump.useAll(Pump.db_listeners)
pump.useAll(Pump.stub_listeners)    # comment this one out and add your own instead

pump.server.listen 3001

module.exports = pump.server

# repl = require("repl").start()
# repl.context.sys = require('sys')
# repl.context.pump = pump
