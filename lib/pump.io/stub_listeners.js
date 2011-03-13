(function() {
  var sys;
  sys = require('sys');
  module.exports = {
    'stub.authenticate': {
      'authenticate': function(message, client) {
        this.log("stub.authenticate: " + (sys.inspect(message)) + ", " + client.sessionId);
        this.emit('authenticationSuccess', message, client);
      }
    },
    'stub.pubsubCheck': {
      'pubsubCheck': function(message, client) {
        this.emit('pubsub', client, message.channel, message.data, message.rid);
      }
    }
  };
}).call(this);
