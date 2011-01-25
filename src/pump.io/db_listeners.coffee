# keep track of:
#   server_ids
#   session ids on a server

sys = require 'sys'

module.exports =

  'core.dbClientConnect':
    'dbClientConnect': (server_id, session_id) ->
      console.log "core.dbClientConnect: #{server_id}, #{session_id}"
      @db.sadd @rkey('server_ids'), server_id
      @db.sadd @rkey('server_id', server_id, 'session_ids'), session_id

  'core.dbClientDisconnect':
    'dbClientDisconnect': (server_id, session_id) ->
      console.log "core.dbClientDisconnect: #{server_id}, #{session_id}"
      @emit 'dbPubSubLeaveAll', session_id
      @db.srem @rkey('server_id', server_id, 'session_ids'), session_id
      @db.get @rkey('session_id', session_id, 'user_id'), (err, user_id) =>
        @db.srem @rkey('user_id', user_id, 'session_ids'), session_id
        @db.del @rkey('session_id', session_id, 'user_id')
  
  'core.dbAuthenticated':
    'dbAuthenticated': (session_id, user_id) ->
      console.log "core.dbAuthenticated: #{session_id}, #{user_id}"
      @db.set @rkey('session_id', session_id, 'user_id'), user_id
      @db.sadd @rkey('user_id', user_id, 'session_ids'), session_id

  'core.dbServerOnline':
    'dbServerOnline': (server_id) ->
      console.log "core.dbServerOnline: #{server_id}"
      @db.sadd @rkey('server_ids'), server_id

  'core.dbServerOffline':
    'dbServerOffline': (server_id) ->
      console.log "core.dbServerOffline: #{server_id}"
      @db.srem @rkey('server_ids'), server_id
      @db.smembers @rkey('server_id', server_id, 'session_ids'), (err, session_ids) =>
        session_ids.forEach (session_id) =>
          @emit 'dbClientDisconnect', server_id, session_id
        @db.del @rkey('server_id', server_id, 'session_ids')

  'core.dbServerSweep':
    'dbServerSweep': ->
      return if @server_sweeping
      console.log "core.dbServerSweep"
      @server_sweeping = true
      @db.smembers @rkey('server_ids'), (err, server_ids) =>
        # set checkin template
        @server_checkins = {}
        for server_id in server_ids
          @server_checkins[server_id] = false
        # send ping to all server_ids
        @s2s
          server_ids: server_ids
          type: 'ping'
        # in 5 seconds, analyze @server_checkins and remove server_ids that didnt check in
        setTimeout () =>
          for server_id in server_ids
            @socket.emit 'serverTimeout', server_id if !@server_checkins[server_id]
          null
        , 5000
        @server_sweeping = false

  'core.dbPubSub':
    'dbPubSub': (session_id, channel, state) ->
      console.log "core.dbPubSub: #{session_id}, #{channel}, #{state}"
      presence = if state == 'subscribed' then false else true
      if state == 'unavailable'
        @db.srem @rkey('session_id', session_id, 'channels'), channel, (err, performed) =>
          @db.srem @rkey('channel', channel, 'session_ids'), session_id, (err, res) =>
            @db.get @rkey('channel', channel, 'session_id', session_id, 'state'), (err, res) =>
              presence = if res == 'subscribed' then false else true
              @db.del @rkey('channel', channel, 'session_id', session_id, 'state'), (err, res) =>
                if presence
                  @db.smembers @rkey('channel', channel, 'session_ids'), (err, session_ids) =>
                    @db.get @rkey('session_id', session_id, 'user_id'), (err, user_id) =>
                      if performed == 1
                        # send unavailable presence of session to all subscribers
                        @s2s({ type: 'presence', from: @resource(session_id, user_id), session_ids: session_ids, data: { channel: channel, state: 'unavailable' } })
      else
        @db.sadd @rkey('session_id', session_id, 'channels'), channel, (err, performed) =>
          @db.sadd @rkey('channel', channel, 'session_ids'), session_id, (err, res) =>
            @db.set @rkey('channel', channel, 'session_id', session_id, 'state'), state, (err, res) =>
              if presence
                @db.smembers @rkey('channel', channel, 'session_ids'), (err, session_ids) =>
                  state_keys = for sid in session_ids
                    @rkey('channel', channel, 'session_id', sid, 'state')
                  user_id_keys = for sid in session_ids
                    @rkey('session_id', sid, 'user_id')
                  @db.mget state_keys, (err, states) =>
                    @db.mget user_id_keys, (err, user_ids) =>
                      # send sessions presence for channel to all subscribers
                      @s2s({ type: 'presence', from: @resource(session_id, user_ids[session_ids.indexOf(session_id)]), session_ids: session_ids, data: { channel: channel, state: state } })
                      # send all subscribers presence to session, except self
                      if performed == 1
                        for sid, i in session_ids
                          unless sid == session_id
                            unless states[i] == 'subscribed'
                              @s2s({ type: 'presence', from: @resource(sid, user_ids[i]), session_ids: [ session_id ], data: { channel: channel, state: states[i] } })

  'core.dbPubSubLeaveAll':
    'dbPubSubLeaveAll': (session_id) ->
      console.log "core.dbPubSubLeaveAll: #{session_id}"
      @db.smembers @rkey('session_id', session_id, 'channels'), (err, channels) =>
        for channel in channels
          @emit 'dbPubSub', session_id, channel, 'unavailable'
