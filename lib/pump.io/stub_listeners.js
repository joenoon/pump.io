(function() {
  var sys;
  sys = require('sys');
  module.exports = {
    'stub.authenticate': {
      'authenticate': function(message, client) {
        console.log("stub.authenticate: " + (sys.inspect(message)) + ", " + client.sessionId);
        return this.emit('authenticationSuccess', client, message.data.user_id);
      }
    },
    'stub.pubsubCheck': {
      'pubsubCheck': function(message, client) {
        return this.emit('pubsub', client, message.data.channel, message.data.state);
      }
    }
  };
}).call(this);
