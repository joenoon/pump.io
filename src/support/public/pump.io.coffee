rid_counter = parseInt(Math.random().toString().substr(2, 6), 10)

class Pump
  constructor: (options) ->
    options = options ? {}
    @host = window.location.hostname
    @port = 8080
    @rememberTransport = false
    @secure = false
    @handlers = {}
    @roster = {}
    @mypresence = {}
    @user_sessions_hash = {}
    @session_user_hash = {}
    
    for own key, val of options
      @[key] = val
    
    socket_options =
      rememberTransport: @rememberTransport
      port: @port
      secure: @secure
    
    socket_options.transports = @transports if @transports
      
    @socket = new io.Socket @host, socket_options

    @socket.on 'connect', @proxy(@onConnect)
    @socket.on 'message', @proxy(@onMessage)
    @socket.on 'disconnect', @proxy(@onDisconnect)
    
    if @debug
      @socket.on 'connect', () -> (console.log 'DEBUG: connect')
      @socket.on 'connecting', (transport_type) -> (console.log 'DEBUG: connecting', transport_type)
      @socket.on 'connect_failed', () -> (console.log 'DEBUG: connect_failed')
      @socket.on 'message', (message) -> (console.log 'DEBUG: message', message)
      @socket.on 'close', () -> (console.log 'DEBUG: close')
      @socket.on 'disconnect', () -> (console.log 'DEBUG: disconnect')
      @socket.on 'reconnect', (transport_type, reconnectionAttempts) -> (console.log 'DEBUG: reconnect', transport_type, reconnectionAttempts)
      @socket.on 'reconnecting', (reconnectionDelay, reconnectionAttempts) -> (console.log 'DEBUG: reconnecting', reconnectionDelay, reconnectionAttempts)
      @socket.on 'reconnect_failed', () -> (console.log 'DEBUG: reconnect_failed')
  
  rid: () ->
    return rid_counter++
    
  proxy: (fn) ->
    that = this
    return () ->
      return fn.apply(that, arguments)

  send: (obj={}, callback=null) ->
    unless typeof obj == 'object'
      throw new Error 'send requires an object'
    return if !obj.type
    if typeof callback == 'function'
      rid = @rid()
      obj.rid = rid
      @on "rid_#{rid}", () =>
        @removeAllEvents "rid_#{rid}"
        callback.apply this, arguments
        return
    if obj.type == 'presence' && obj.data
      key = obj.channel
      if obj.data == 'unavailable'
        delete @mypresence[key]
      else
        @mypresence[key] = obj
    str = JSON.stringify(obj)
    @socket.send str
    return this

  userIdFromResource: (str) ->
    parts = str.toString().split("/")
    if parts.length == 2 then return parts[1] else return ""

  sessionIdFromResource: (str) ->
    parts = str.toString().split("/")
    if parts.length == 2 then return parts[0] else return ""

  connect: ->
    return if @state in [ 'confirmed', 'connected', 'connecting' ]
    @state = 'connecting'
    @socket.connect()
    return
    
  subscribe: (channel, state='available') ->
    @send
      type: 'presence'
      channel: channel
      data:
        state: state
    return
  
  unsubscribe: (channel) ->
    @subscribe channel, 'unavailable'
    return

  on: (name, fn) ->
    return unless name && fn
    @handlers[name] = [] unless name of @handlers
    @handlers[name].push fn
    return this

  emit: ->
    args = for arg in arguments
      arg
    name = args.shift()
    return unless name
    if name of @handlers
      events = @handlers[name].concat()
      for fn in events
        fn.apply this, args
    return this

  removeEvent: (name, fn) ->
    return unless name
    if name of @handlers
      for fn, i in @handlers[name]
        @handlers[name].splice(i, 1) if @handlers[name][i] == fn
    return this
  
  removeAllEvents: (name) ->
    return unless name
      delete @handlers[name]
    return this
    
  onConnect: ->
    @sessionId = @socket.transport.sessionid
    @state = 'connected'
    @emit 'connect'
    @send { type: 'ping' }, (payload) =>
      if payload.type == 'pong'
        @state = 'confirmed'
        @emit 'connection_confirmed'
        @_resendPresences()
      return
    return

  onDisconnect: ->
    @sessionId = null
    @state = 'disconnected'
    @emit 'disconnect'
    return
  
  onMessage: (data) ->
    data ||= {}
    if typeof data == 'string'
      try
        data = JSON.parse(data)
      catch err
        data = {}
    if data.type
      @_ridHandler(data) if data.rid
      @_rosterHandler(data) if data.type == 'presence'
      @_timeHandler(data) if data.ts
      @emit data.type, data
    return
  
  _rosterHandler: (payload) ->
    return unless payload.from
    key = if payload.channel then payload.channel else 'global'
    @roster[key] = {} unless key of @roster
    session_id = @sessionIdFromResource(payload.from)
    user_id = @userIdFromResource(payload.from)
    changed = false
    if session_id && user_id
      @session_user_hash[session_id] = user_id
      @user_sessions_hash[user_id] = [] unless user_id of @user_sessions_hash
      @user_sessions_hash[user_id].push(session_id) unless session_id in @user_sessions_hash[user_id]
    if session_id && payload.data
      state = payload.data.state
      if state == 'unavailable'
        if session_id == @sessionId
          if key == 'global'
            @roster = {}
          else
            if key of @roster
              @roster[key] = {}
            delete @mypresence[key]
          changed = true
        else
          if session_id of @roster[key]
            delete @roster[key][session_id]
            changed = true
      else
        @roster[key][session_id] = state
        changed = true
    if changed
      @emit 'presenceChanged', { channel: key, state: state, session_id: session_id, user_id: user_id, data: payload.data }
    return
  
  _resendPresences: () ->
    if @debug
      console.log 'DEBUG: _resendPresences', @mypresence
    for own key, value of @mypresence when value
      @send value
    return
    
  _timeHandler: (payload) ->
    client_time = new Date().getTime()            # dec 1               # dec2
    server_time = payload.ts                      # dec 2               # dec1
    @time_delta = client_time - server_time       # -1 day              # +1 day
    return
  
  _ridHandler: (payload) ->
    @emit "rid_#{payload.rid}", payload
    return
  
  adjustedEpoch: (epoch_mil) ->
    time_delta = @time_delta || 0   # some epoch from server for dec 2: dec 2 - 1 day = dec 1 on client
    return epoch_mil + time_delta   # some epoch from server for dec 1: dec 1 + 1 day = dec 2 on client
    
  userSessionsInArea: (key, user_id) ->
    session_ids_in_area = {}
    if key of @roster
      area = @roster[key]
      session_ids = @user_sessions_hash[user_id] || []
      for session_id in session_ids when session_id of area
        session_ids_in_area[session_id] = area[session_id]
    return session_ids_in_area
  
  rosterCount: (key) ->
    count = 0
    if key of @roster
      area = @roster[key]
      for own key of area
        count += 1
    return count
    
this.Pump = Pump
