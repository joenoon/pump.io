class Pump
  constructor: (options) ->
    options = options ? {}
    @host = window.location.hostname
    @port = 8080
    @rememberTransport = false
    @reconnect = true
    @secure = false
    @handlers = {}
    
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

  connect: ->
    return if @state in [ 'connected', 'connecting' ]
    @socket.connect()
    
  subscribe: (channel, state='available') ->
    @send
      type: 'pubsub'
      data:
        channel: channel
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
    @emit 'message', data
  
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
