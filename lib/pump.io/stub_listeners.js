(function() {
  var sys;
  sys = require('sys');
  module.exports = {
    'stub.authenticate': {
      'authenticate': function(message, client) {
        console.log("stub.authenticate: " + (sys.inspect(message)) + ", " + client.sessionId);
        this.emit('authenticationSuccess', client, message.data.user_id);
      }
    },
    'stub.pubsubCheck': {
      'pubsubCheck': function(message, client) {
        this.emit('pubsub', client, message.channel, message.data);
      }
    }
  };
}).call(this);
