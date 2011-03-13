# keep track of:
#   server_ids
#   session ids on a server

sys = require 'sys'

module.exports =

  'core.dbClientConnect':
    'dbClientConnect': (server_id, session_id) ->
      @log "core.dbClientConnect: #{server_id}, #{session_id}"
      @db.sadd @rkey('server_id', server_id, 'session_ids'), session_id
      @db.set @rkey('session_id', session_id, 'server_id'), server_id
      return

  'core.dbClientDisconnect':
    'dbClientDisconnect': (server_id, session_id) ->
      @log "core.dbClientDisconnect: #{server_id}, #{session_id}"
      @emit 'dbPubSubLeaveAll', session_id
      @db.del @rkey('session_id', session_id, 'server_id')
      @db.srem @rkey('server_id', server_id, 'session_ids'), session_id
      @db.get @rkey('session_id', session_id, 'user_id'), (err, user_id) =>
        @db.srem @rkey('user_id', user_id, 'session_ids'), session_id
        @db.del @rkey('session_id', session_id, 'user_id')
        return
      return
  
  'core.dbAuthenticated':
    'dbAuthenticated': (session_id, user_id) ->
      @log "core.dbAuthenticated: #{session_id}, #{user_id}"
      @db.set @rkey('session_id', session_id, 'user_id'), user_id, (err, res) =>
        @db.sadd @rkey('user_id', user_id, 'session_ids'), session_id, (err, res) =>
          @emit 'dbPubSubRejoinAll', session_id
          return
        return
      return

  'core.dbServerOnline':
    'dbServerOnline': (server_id) ->
      @log "core.dbServerOnline: #{server_id}"
      @db.sadd @rkey('server_ids'), server_id
      return

  'core.dbServerOffline':
    'dbServerOffline': (server_id) ->
      @log "core.dbServerOffline: #{server_id}"
      @db.srem @rkey('server_ids'), server_id
      @db.smembers @rkey('server_id', server_id, 'session_ids'), (err, session_ids) =>
        for session_id in session_ids
          @emit 'dbClientDisconnect', server_id, session_id
        @db.del @rkey('server_id', server_id, 'session_ids')
        return
      return

  'core.dbServerSweep':
    'dbServerSweep': ->
      return if !@server_sweeper
      return if @server_sweeping
      @log "core.dbServerSweep by #{@server_id}"
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
          @emit 'serversSweeped'
          return
        , 5000
        @server_sweeping = false
        return
      return

  'core.dbPubSub':
    'dbPubSub': (session_id, channel, data, rid) ->
      @log "core.dbPubSub: #{session_id}, #{channel}, state: #{data.state}"
      data.state ||= 'available'
      state = data.state
      presence = if state == 'subscribed' then false else true
      if state == 'unavailable'
        @db.srem @rkey('session_id', session_id, 'channels'), channel, (err, res) =>
          @db.srem @rkey('channel', channel, 'session_ids'), session_id, (err, res) =>
            @db.get @rkey('channel', channel, 'session_id', session_id, 'data'), (err, current_data) =>
              current_data = @parseJSON(current_data) || {}
              presence = if current_data.state == 'subscribed' then false else true
              @db.del @rkey('channel', channel, 'session_id', session_id, 'data'), (err, res) =>
                if presence
                  @db.smembers @rkey('channel', channel, 'session_ids'), (err, session_ids) =>
                    @db.get @rkey('session_id', session_id, 'user_id'), (err, user_id) =>
                      # send unavailable presence of session to all subscribers
                      @s2s({ type: 'presence', rid: rid, from: @resource(session_id, user_id), session_ids: [ session_id ], channel: channel, data: { state: 'unavailable' } })
                      @s2s({ type: 'presence', from: @resource(session_id, user_id), session_ids: session_ids, channel: channel, data: { state: 'unavailable' } })
                      return
                    return
                return
              return
            return
          return
      else
        data_s = @toJSON(data)
        @db.sadd @rkey('session_id', session_id, 'channels'), channel, (err, performed) =>
          @db.sadd @rkey('channel', channel, 'session_ids'), session_id, (err, res) =>
            @db.set @rkey('channel', channel, 'session_id', session_id, 'data'), data_s, (err, res) =>
              if presence
                @db.smembers @rkey('channel', channel, 'session_ids'), (err, session_ids) =>
                  data_keys = for sid in session_ids
                    @rkey('channel', channel, 'session_id', sid, 'data')
                  user_id_keys = for sid in session_ids
                    @rkey('session_id', sid, 'user_id')
                  @db.mget data_keys, (err, datas) =>
                    @db.mget user_id_keys, (err, user_ids) =>
                      # send sessions presence for channel to all subscribers
                      session_ids_except_me = for sid in session_ids when sid != session_id
                        sid
                      from_me = @resource(session_id, user_ids[session_ids.indexOf(session_id)])
                      @s2s({ type: 'presence', rid: rid, from: from_me, session_ids: [ session_id ], channel: channel, data: data })
                      @s2s({ type: 'presence', from: from_me, session_ids: session_ids_except_me, channel: channel, data: data })
                      if performed == 1
                        # send all subscribers presence to session, except self
                        for sid, i in session_ids_except_me
                          data_i = datas[i]
                          if data_i
                            data_i = @parseJSON(data_i)
                            unless data_i.state  == 'subscribed'
                              @s2s({ type: 'presence', from: @resource(sid, user_ids[i]), session_ids: [ session_id ], channel: channel, data: data_i })
                      return
                    return
                  return
              return
            return
          return
      return

  'core.dbPubSubLeaveAll':
    'dbPubSubLeaveAll': (session_id) ->
      @log "core.dbPubSubLeaveAll: #{session_id}"
      @db.smembers @rkey('session_id', session_id, 'channels'), (err, channels) =>
        for channel in channels
          @emit 'dbPubSub', session_id, channel, { state: 'unavailable' }
        return
      return

  'core.dbPubSubRejoinAll':
    'dbPubSubRejoinAll': (session_id) ->
      @log "core.dbPubSubRejoinAll: #{session_id}"
      @db.smembers @rkey('session_id', session_id, 'channels'), (err, channels) =>
        data_keys = for channel in channels
          @rkey('channel', channel, 'session_id', session_id, 'data')
        @db.mget data_keys, (err, datas) =>
          for channel, i in channels
            data_i = datas[i]
            if data_i
              data_i = @parseJSON(data_i)
              data_i.state ||= 'available'
              @emit 'dbPubSub', session_id, channel, data_i
        return
      return
