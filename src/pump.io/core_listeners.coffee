sys = require 'sys'

module.exports =

  'core.clientConnect':
    'clientConnect': (client) ->
      console.log "core.clientConnect: #{client.sessionId}"
      client.pump = this
      @emit 'dbClientConnect', @server_id, client.sessionId
      return

  'core.clientDisconnect':
    'clientDisconnect': (client) ->
      console.log "core.clientDisconnect: #{client.sessionId}"
      @emit 'dbClientDisconnect', @server_id, client.sessionId
      return

  'core.disconnectAll':
    'disconnectAll': ->
      console.log "core.disconnectAll"
      for client_id, client of @socket.clients
        client._onClose()
      return
  
  'core.clientMessage':
    'clientMessage': (message, client) ->
      message = @parseIncoming(message)
      console.log "core.clientMessage: #{message.type}, #{client.sessionId}"
      if message.type == 'authenticate'
        @emit 'authenticate', message, client
      else if message.type == 'presence' && message.channel
        @emit 'pubsubCheck', message, client
      return

  'core.authenticationSuccess':
    'authenticationSuccess': (client, user_id) ->
      console.log "core.authenticationSuccess: #{client.sessionId}, #{user_id}"
      client.user_id = user_id
      client.authenticated = true
      client.send({ type: 'authenticated', data: { result: true, user_id: client.user_id } })
      @emit 'dbAuthenticated', client.sessionId, client.user_id
      return

  'core.authenticationFailed':
    'authenticationFailed': (client) ->
      console.log "core.authenticationSuccess: #{client.sessionId}"
      client.send({ type: 'authenticated', data: { result: false } })
      return
      
  'core.subscriberMessage':
    'subscriberMessage': (channel, message) ->
      @emit 'payload', @parseJSON(message)
      return

  'core.payload.pingpong':
    'payload': (payload) ->
      if @server_id in payload.server_ids && payload.type in [ 'ping', 'pong' ]
        if payload.type == 'ping'
          console.log "ping on #{@server_id}"
          @s2s
            server_ids: [ payload.origin_server_id ]
            type: 'pong'
        else if payload.type == 'pong'
          console.log "pong on #{@server_id} from #{payload.origin_server_id}"
          @server_checkins[payload.origin_server_id] = true
      return

  'core.payload.message':
    'payload': (payload) ->
      return unless payload.session_ids.length > 0
      console.log "core.payload.message: type: #{payload.type}, session_ids: #{payload.session_ids.join(',')}"
      ci = @socket.clients
      client_payload = @clientPayload(payload)
      for session_id in payload.session_ids
        if session_id of ci
          ci[session_id].send client_payload
      return

  'core.subscriberUnsubscribed':
    'subscriberUnsubscribed': (channel, subscription_count) ->
      console.log "Unsubscribe Received: Channel: #{channel}, Subscription Count: #{subscription_count}, Shutting Down: #{!!@subscriber.shutting_down}"
      @subscriber.quit() if @subscriber.shutting_down && subscription_count == 0
      return

  'core.serverTimeout':
    'serverTimeout': (server_id) ->
      console.log "core.serverTimeout for #{server_id}"
      @emit 'serverOffline', server_id
      return

  'core.serverOnline':
    'serverOnline': (server_id) ->
      console.log "core.serverOnline: #{server_id}"
      @emit 'dbServerOnline', server_id
      return

  'core.serverOffline':
    'serverOffline': (server_id) ->
      console.log "core.serverOffline: #{server_id}"
      @emit 'dbServerOffline', server_id
      return

  'core.serverSweep':
    'serverSweep': ->
      @emit 'dbServerSweep'
      return
      
  'core.pubsub':
    'pubsub': (client, channel, data) ->
      @emit 'dbPubSub', client.sessionId, channel, data
      return
