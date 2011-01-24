sys = require 'sys'

module.exports =

  'core.clientConnect':
    'clientConnect': (client) ->
      console.log "core.clientConnect: #{client.sessionId}"
      client.pump = this
      @emit 'dbClientConnect', @server_id, client.sessionId

  'core.clientDisconnect':
    'clientDisconnect': (client) ->
      console.log "core.clientDisconnect: #{client.sessionId}"
      @emit 'dbClientDisconnect', @server_id, client.sessionId

  'core.disconnectAll':
    'disconnectAll': ->
      console.log "core.disconnectAll"
      for client_id, client of @socket.clients
        client._onClose()
  
  'core.clientMessage':
    'clientMessage': (message, client) ->
      message = @parseIncoming(message)
      console.log "core.clientMessage: #{sys.inspect(message)}, #{client.sessionId}"
      if message.type == 'authenticate'
        @emit 'authenticate', message, client
      else if message.type == 'pubsub' && message.data.channel
        @emit 'pubsubCheck', message, client

  'core.authenticationSuccess':
    'authenticationSuccess': (client, user_id) ->
      console.log "core.authenticationSuccess: #{client.sessionId}, #{user_id}"
      client.user_id = user_id
      client.authenticated = true
      client.send({ type: 'authenticated', data: { result: true, user_id: client.user_id } })
      @emit 'dbAuthenticated', client.sessionId, client.user_id

  'core.authenticationFailed':
    'authenticationFailed': (client) ->
      console.log "core.authenticationSuccess: #{client.sessionId}"
      client.send({ type: 'authenticated', data: { result: false } })
      
  'core.subscriberMessage':
    'subscriberMessage': (channel, message) ->
      if channel == @cluster_name
        @emit 'payload', @parseJSON(message)

  'core.payload.pingpong':
    'payload': (payload) ->
      if @server_id in payload.server_ids && payload.type in [ 'ping', 'pong' ]
        console.log "core.payload.pingpong"
        if payload.type == 'ping'
          @s2s
            server_ids: [ payload.origin_server_id ]
            type: 'pong'
        else if payload.type == 'pong'
          @server_checkins[payload.origin_server_id] = true

  'core.payload.messageToUserIds':
    'payload': (payload) ->
      return unless payload.user_ids.length > 0
      console.log "core.payload.messageToUserIds: #{sys.inspect(payload.user_ids)}"
      session_keys = for user_id in payload.user_ids
        @rkey('user_id', user_id, 'session_ids')
      ci = @socket.clients
      client_payload = @clientPayload(payload)
      @db.sunion session_keys, (err, session_ids) =>
        session_ids.forEach (session_id) =>
          if cli = ci[session_id]
            cli.send client_payload

  'core.payload.message':
    'payload': (payload) ->
      return unless payload.session_ids.length > 0
      console.log "core.payload.message: #{sys.inspect(payload)}"
      ci = @socket.clients
      client_payload = @clientPayload(payload)
      payload.session_ids.forEach (session_id) =>
        if cli = ci[session_id]
          cli.send client_payload

  'core.subscriberUnsubscribed':
    'subscriberUnsubscribed': (channel, subscription_count) ->
      console.log "Unsubscribe Received: Channel: #{channel}, Subscription Count: #{subscription_count}, Shutting Down: #{!!@subscriber.shutting_down}"
      @subscriber.quit() if @subscriber.shutting_down && subscription_count == 0

  'core.serverTimeout':
    'serverTimeout': (server_id) ->
      console.log "core.serverTimeout for #{server_id}"
      @emit 'serverOffline', server_id

  'core.serverOnline':
    'serverOnline': (server_id) ->
      console.log "core.serverOnline: #{server_id}"
      @emit 'dbServerOnline', server_id

  'core.serverOffline':
    'serverOffline': (server_id) ->
      console.log "core.serverOffline: #{server_id}"
      @emit 'dbServerOffline', server_id

  'core.serverSweep':
    'serverSweep': ->
      @emit 'dbServerSweep'
      
  'core.pubsub':
    'pubsub': (client, channel, state) ->
      @emit 'dbPubSub', client.sessionId, channel, state
