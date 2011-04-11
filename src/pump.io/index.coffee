sys = require 'sys'
express = require 'express'
connect = require 'connect'
EventEmitter = require('events').EventEmitter
redis = require 'redis'
# redis.debug_mode = true
io = require 'socket.io'
fs = require 'fs'
url = require 'url'

clientVersion = '0.0.8'

random_number_between = (low, high) ->
  Math.floor(Math.random() * (high - low + 1)) + low

class Pump extends EventEmitter
  constructor: (options={}) ->
    @host = options.host || '0.0.0.0'
    @port = options.port || 8080
    @redis_host = options.redis_host || '127.0.0.1'
    @redis_port = options.redis_port || 6379
    @cluster_name = options.cluster_name || 'pumpcluster'
    @static_resource = options.static_resource || 'pump.io'
    @clientVersion = options.clientVersion || clientVersion
    @server_id = Math.random().toString().substr(2)
    @server_checkins = {}
    @__listeners = {}
    @_clientFiles = {}
    @__last_sweeped_at = 0
    @server_sweeper = false
    
    @log = sys.log

    @server = express.createServer()
    
    @server.use () =>
      @_checkRequest.apply(this, arguments)
      return
    @server.use connect.bodyParser()
    @server.use connect.methodOverride()
    @server.use connect.errorHandler({ dumpExceptions: true, showStack: true })
    @server.use @server.router
    
    @server.post '/s2s', (req, res) =>
      if @_checkAllowedRequest(res)
        res.writeHead 200, {'Content-Type': 'application/json'}
        res.end JSON.stringify({ success: true })
        @s2s(req.body)
      else
        res.writeHead 403, {'Content-Type': 'application/json'}
        res.end JSON.stringify({ success: false })
      return

  
  listen: (callback) ->
    @server.listen(@port, @host, callback)
    @socket = io.listen @server
    @db = redis.createClient(@redis_port, @redis_host)
    @publisher = redis.createClient(@redis_port, @redis_host)
    @subscriber = redis.createClient(@redis_port, @redis_host)
    @subscriber.subscribe @rkey(@cluster_name, 'server', @server_id)
    @__bind_listeners()
    # start kicking off server sweeper checks between 10 and 120 seconds from now
    setTimeout () =>
      @__server_sweeper_interval = setInterval (() => @emit('serverSweep')), 10000
      @__server_sweeper_primary_check_internal = setInterval (() => @emit('serverSweepPrimaryCheck')), 60000
      return
    , random_number_between(10, 120) * 1000
    @emit 'serverOnline', @server_id
    return
    
  use: (unique_name, type, fn) ->
    that = this
    @__listeners[unique_name] = () ->
      return fn.apply(that, arguments)
    @log "using listener on #{type}: #{unique_name}"
    @on type, @__listeners[unique_name]
    return
  
  useAll: (hash) ->
    for unique_name, data of hash
      for type, fn of data
        @use unique_name, type, fn
    return
    
  unuse: (unique_name, type) ->
    @log "un-using listener on #{type}: #{unique_name}"
    @removeListener type, @__listeners[unique_name]
    delete @__listeners[unique_name]
    return
  
  connectUse: (fn) ->
    fn(connect)
    
  rkey: () ->
    arr = for arg in arguments
      arg
    arr.unshift @cluster_name
    return "#{arr.join(":")}"
    
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
        return
    else if obj.channel && obj.session_ids.length == 0
      @db.smembers @rkey('channel', obj.channel, 'session_ids'), (err, session_ids) =>
        if session_ids.length > 0
          obj.session_ids = session_ids
          @s2s obj
        return
    else if obj.server_ids.length > 0
      for server_id in obj.server_ids
        obj.ts = new Date().getTime()
        @publisher.publish @rkey(@cluster_name, 'server', server_id), @toJSON(obj)
    else if obj.session_ids.length > 0
      session_server_id_keys = for session_id in obj.session_ids
        @rkey('session_id', session_id, 'server_id')
      @db.mget session_server_id_keys, (err, session_server_ids) =>
        session_server_ids ||= []
        mapper = {}
        for server_id, i in session_server_ids
          if server_id
            mapper[server_id] ||= []
            mapper[server_id].push obj.session_ids[i]
        for server_id, session_ids of mapper
          obj.session_ids = session_ids
          obj.ts = new Date().getTime()
          @publisher.publish @rkey(@cluster_name, 'server', server_id), @toJSON(obj)
        return
    else
      @log "s2s not sent because no recipients: #{sys.inspect(obj)}"
    return
  
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
    
  __bind_listeners: ->

    @socket.on 'clientMessage', (message, client) =>
      @emit 'clientMessage', @parseJSON(message), client
    
    @socket.on 'clientConnect', (client) =>
      @emit 'clientConnect', client
    
    @socket.on 'clientDisconnect', (client) =>
      @emit 'clientDisconnect', client
    
    @socket.on 'disconnectAll', =>
      @emit 'disconnectAll'
      
    @socket.on 'serverTimeout', (server_id) =>
      @emit 'serverTimeout', server_id

    @subscriber.on 'message', (channel, message) =>
      @emit 'subscriberMessage', channel, message

    @subscriber.on 'unsubscribe', (channel, subscription_count) =>
      @emit 'subscriberUnsubscribed', channel, subscription_count
    
    return
  
  # override to block access to POST /s2s in custom ways
  _checkAllowedRequest: (req) ->
    return true
    
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
      if false && req.headers['if-none-match'] == @clientVersion
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

Pump.core_listeners = require './core_listeners.js'
Pump.db_listeners = require './db_listeners.js'
Pump.stub_listeners = require './stub_listeners.js'
  
module.exports = Pump
