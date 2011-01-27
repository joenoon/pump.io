sys = require 'sys'

module.exports =

  'stub.authenticate':
    'authenticate': (message, client) ->
      console.log "stub.authenticate: #{sys.inspect(message)}, #{client.sessionId}"
      @emit 'authenticationSuccess', client, message.data.user_id
      # @emit 'authenticationFailed', client
      return

  'stub.pubsubCheck':
    'pubsubCheck': (message, client) ->
      @emit 'pubsub', client, message.channel, message.data
      # special states:
      # unavailable : removes client from channel.  if they were state 'pubsub', no presence sent out
      # subscribed : subscribes a client to channel.  no presence
      # take care to replace this listener with one that validates what people can do
      return
      
