sys = require 'sys'
express = require 'express'
EventEmitter = require('events').EventEmitter
redis = require 'redis'
# redis.debug_mode = true
io = require 'socket.io'
fs = require 'fs'
url = require 'url'

clientVersion = '0.0.2'

class Pump extends EventEmitter
  constructor: (options={}) ->
    @host = options.host || '0.0.0.0'
    @port = options.port || 8080
    @cluster_name = options.cluster_name || 'pumpcluster'
    @server_sweeper = options.server_sweeper || false
    @static_resource = options.static_resource || 'pump.io'
    @clientVersion = options.clientVersion || clientVersion
    @server_id = Math.random().toString().substr(2)
    @server_checkins = {}
    @__listeners = {}
    @_clientFiles = {}

    @server = express.createServer()
    @server.use () =>
      @_checkRequest.apply(this, arguments)
    @socket = io.listen @server
    @socket.users = []

    @db = redis.createClient()
    @publisher = redis.createClient()
    @subscriber = redis.createClient()
    @subscriber.subscribe @cluster_name
    @__bind_listeners()
    if @server_sweeper
      @__server_sweeper_interval = setInterval (() => @emit('serverSweep')), 10000
    
  use: (unique_name, type, fn) ->
    that = this
    @__listeners[unique_name] = () ->
      return fn.apply(that, arguments)
    console.log "using listener on #{type}: #{unique_name}"
    @on type, @__listeners[unique_name]
    return
  
  useAll: (hash) ->
    for unique_name, data of hash
      for type, fn of data
        @use unique_name, type, fn
    return
    
  unuse: (unique_name, type) ->
    console.log "un-using listener on #{type}: #{unique_name}"
    @removeListener type, @__listeners[unique_name]
    delete @__listeners[unique_name]
    return
  
  rkey: () ->
    arr = for arg in arguments
      arg
    arr.unshift @cluster_name
    return "#{arr.join(":")}"
    
  internalChannel: (channel) ->
    return "#{@cluster_name}#{channel}"
    
  s2s: (obj) ->
    if typeof obj == 'string'
      obj = JSON.parse(obj)
    obj.origin_server_id = @server_id
    obj.data ||= {}
    obj.server_ids ||= []
    obj.session_ids ||= []
    obj.user_ids ||= []
    if obj.user_ids.length > 0
      session_keys = for user_id in obj.user_ids
        @rkey('user_id', user_id, 'session_ids')
      @db.sunion session_keys, (err, session_ids) =>
        obj.user_ids = []
        obj.session_ids = session_ids
        @s2s obj
    else if obj.channel && obj.session_ids.length == 0
      @db.smembers @rkey('channel', obj.channel, 'session_ids'), (err, session_ids) =>
        if session_ids.length > 0
          obj.session_ids = session_ids
          @s2s obj
    else if obj.server_ids.length > 0 || obj.session_ids.length > 0
      @publisher.publish @cluster_name, @toJSON(obj)
    else
      console.log "s2s not sent because no recipients: #{sys.inspect(obj)}"
  
  toJSON: (obj) ->
    try
      if typeof(obj) == 'object'
        obj = JSON.stringify(obj)
    catch err
      obj = JSON.stringify({})
    return obj
      
  parseJSON: (obj) ->
    try
      if typeof obj == 'string'
        obj = JSON.parse(obj)
    catch err
      obj = {}
    return obj
  
  parseIncoming: (obj) ->
    obj = @parseJSON(obj)
    obj.data ||= {}
    return obj
  
  clientPayload: (payload) ->
    client_payload = {}
    for key, val of payload when key ! in [ 'server_ids', 'session_ids', 'user_ids', 'origin_server_id' ]
      client_payload[key] = val
    return client_payload
    
  resource: (session_id, user_id) ->
    sid = session_id ? ''
    uid = user_id ? ''
    return "#{sid}/#{uid}"
    
  graceful_exit: ->
    console.log 'graceful shutdown...'
    process.nextTick =>
      if @__server_sweeper_interval
        clearInterval(@__server_sweeper_interval)
      @server.close()
      @emit 'disconnectAll'
      @subscriber.shutting_down = true
      @subscriber.unsubscribe @cluster_name
      @subscriber.quit()
    true
      
  __bind_listeners: ->

    @socket.on 'clientMessage', (message, client) =>
      @emit 'clientMessage', @parseJSON(message), client
    
    @socket.on 'clientConnect', (client) =>
      @emit 'clientConnect', client
    
    @socket.on 'clientDisconnect', (client) =>
      @emit 'clientDisconnect', client
    
    @socket.on 'disconnectAll', =>
      @emit 'disconnectAll'
      
    if @server_sweeper
      @socket.on 'serverTimeout', (server_id) =>
        @emit 'serverTimeout', server_id

    @subscriber.on 'message', (channel, message) =>
      @emit 'subscriberMessage', channel, message

    @subscriber.on 'unsubscribe', (channel, subscription_count) =>
      @emit 'subscriberUnsubscribed', channel, subscription_count
    
    return
      
  _checkRequest: (req, res, next) ->
    path = url.parse(req.url).pathname
    if path && path.indexOf('/' + @static_resource) == 0
      parts = path.substr(2 + @static_resource.length).split('/')
      return true if @_serveClient(parts.join('/'), req, res)
    next()

  _serveClient: (file, req, res) ->
    clientPaths =
      'pump.io.js': 'pump.io.js'
    types =
      js: 'text/javascript'
  
    write = (path) =>
      if req.headers['if-none-match'] == @clientVersion
        res.writeHead 304
        res.end()
      else
        res.writeHead 200, @_clientFiles[path].headers
        res.end @_clientFiles[path].content, @_clientFiles[path].encoding
  
    path = clientPaths[file]
  
    if req.method == 'GET' && path?
      if path of @_clientFiles
        write(path)
        return true
      
      fs.readFile __dirname + '/../support/public/' + path, (err, data) =>
        if err
          res.writeHead 404
          res.end '404'
        else
          ext = path.split('.').pop()
          @_clientFiles[path] =
            headers:
              'Content-Length': data.length
              'Content-Type': types[ext]
              'ETag': @clientVersion
            content: data
            encoding: 'utf8'
          write path
      return true
    return false

  @create: (cluster_name, port, host, server_sweeper) ->
    return (new Pump(cluster_name, port, host, server_sweeper))

Pump.core_listeners = require './core_listeners.js'
Pump.db_listeners = require './db_listeners.js'
Pump.stub_listeners = require './stub_listeners.js'
  
module.exports = Pump
