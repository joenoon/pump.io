sys = require 'sys'
express = require 'express'
Pump = require '../lib/pump.io'
core_listeners = require '../lib/pump.io/core_listeners.js'
db_listeners = require '../lib/pump.io/db_listeners.js'
stub_listeners = require '../lib/pump.io/stub_listeners.js'

pump = Pump.create(process.sparkEnv)
pump.server.use express.staticProvider("#{__dirname}/public")

pump.useAll(core_listeners)
pump.useAll(db_listeners)
pump.useAll(stub_listeners)    # comment this one out and add your own instead

module.exports = pump.server

# repl = require("repl").start()
# repl.context.sys = require('sys')
# repl.context.pump = pump
