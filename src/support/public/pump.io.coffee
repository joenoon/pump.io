class Pump
  constructor: (options) ->
    options = options ? {}
    @host = window.location.hostname
    @port = 8080
    @rememberTransport = false
    @reconnect = true
    @secure = false
    @handlers = {}
    @roster = {}
    @user_sessions_hash = {}
    @session_user_hash = {}
    
    for key, val of options
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

  proxy: (fn) ->
    that = this
    return () ->
      return fn.apply(that, arguments)

  send: (obj) ->
    obj ||= {}
    unless typeof obj == 'string'
      try
        obj = JSON.stringify(obj)
      catch err
        null
    @socket.send obj if obj
    return this

  userIdFromResource: (str) ->
    parts = str.toString().split("/")
    if parts.length == 2 then return parts[1] else return ""

  sessionIdFromResource: (str) ->
    parts = str.toString().split("/")
    if parts.length == 2 then return parts[0] else return ""

  connect: ->
    return if @state in [ 'connected', 'connecting' ]
    @socket.connect()
    
  subscribe: (channel, state='available') ->
    @send
      type: 'presence'
      channel: channel
      data:
        state: state
  
  unsubscribe: (channel) ->
    @subscribe channel, 'unavailable'

  on: (name, fn) ->
    return unless name && fn
    name = "pump#{name}"
    @handlers[name] = [] unless name of @handlers
    @handlers[name].push fn
    return this

  emit: ->
    args = for arg in arguments
      arg
    name = args.shift()
    return unless name
    name = "pump#{name}"
    if name of @handlers
      events = @handlers[name].concat()
      for fn in events
        fn.apply this, args
    return this

  removeEvent: (name, fn) ->
    return unless name
    name = "pump#{name}"
    if name of @handlers
      for fn, i in @handlers[name]
        @handlers[name].splice(i, 1) if @handlers[name][i] == fn
    return this

  onConnect: ->
    @sessionId = @socket.transport.sessionid
    @emit 'connect'

  onDisconnect: ->
    @sessionId = null
    @emit 'disconnect'
    @doReconnect() if @reconnect
  
  onMessage: (data) ->
    data ||= {}
    if typeof data == 'string'
      try
        data = JSON.parse(data)
      catch err
        data = {}
    @_rosterHandler(data) if data.type == 'presence'
    @emit 'message', data
  
  _rosterHandler: (payload) ->
    return unless payload.from
    key = if payload.channel then payload.channel else 'global'
    @roster[key] = {} unless key of @roster
    session_id = @sessionIdFromResource(payload.from)
    user_id = @userIdFromResource(payload.from)
    if session_id && user_id
      @session_user_hash[session_id] = user_id
      @user_sessions_hash[user_id] = [] unless user_id of @user_sessions_hash
      @user_sessions_hash[user_id].push(session_id) unless session_id in @user_sessions_hash[user_id]
    if session_id && payload.data
      state = payload.data.state
      if state == 'unavailable'
        if session_id of @roster[key]
          delete @roster[key][session_id]
          @emit 'presenceChanged', { channel: key, state: state, session_id: session_id, user_id: user_id, data: payload.data }
      else
        unless session_id of @roster[key] && @roster[key][session_id] == state
          @roster[key][session_id] = state
          @emit 'presenceChanged', { channel: key, state: state, session_id: session_id, user_id: user_id, data: payload.data }
    return
  
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
    
  doReconnect: ->
    return if @_reconnectInterval

    clear = () =>
      clearInterval @_reconnectInterval
      @_reconnectInterval = null

    reconnect = () =>
      if @socket.connecting
        # do nothing
      else if @socket.connected
        clear()
      else
        @emit 'reconnecting'
        @connect()
      
    @_reconnectInterval = setInterval reconnect, 3000

this.Pump = Pump
