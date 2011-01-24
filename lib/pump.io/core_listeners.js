(function() {
  var sys;
  var __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  }, __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  sys = require('sys');
  module.exports = {
    'core.clientConnect': {
      'clientConnect': function(client) {
        console.log("core.clientConnect: " + client.sessionId);
        client.pump = this;
        return this.emit('dbClientConnect', this.server_id, client.sessionId);
      }
    },
    'core.clientDisconnect': {
      'clientDisconnect': function(client) {
        console.log("core.clientDisconnect: " + client.sessionId);
        return this.emit('dbClientDisconnect', this.server_id, client.sessionId);
      }
    },
    'core.disconnectAll': {
      'disconnectAll': function() {
        var client, client_id, _ref, _results;
        console.log("core.disconnectAll");
        _ref = this.socket.clients;
        _results = [];
        for (client_id in _ref) {
          client = _ref[client_id];
          _results.push(client._onClose());
        }
        return _results;
      }
    },
    'core.clientMessage': {
      'clientMessage': function(message, client) {
        message = this.parseIncoming(message);
        console.log("core.clientMessage: " + (sys.inspect(message)) + ", " + client.sessionId);
        if (message.type === 'authenticate') {
          return this.emit('authenticate', message, client);
        } else if (message.type === 'pubsub' && message.data.channel) {
          return this.emit('pubsubCheck', message, client);
        }
      }
    },
    'core.authenticationSuccess': {
      'authenticationSuccess': function(client, user_id) {
        console.log("core.authenticationSuccess: " + client.sessionId + ", " + user_id);
        client.user_id = user_id;
        client.authenticated = true;
        client.send({
          type: 'authenticated',
          data: {
            result: true,
            user_id: client.user_id
          }
        });
        return this.emit('dbAuthenticated', client.sessionId, client.user_id);
      }
    },
    'core.authenticationFailed': {
      'authenticationFailed': function(client) {
        console.log("core.authenticationSuccess: " + client.sessionId);
        return client.send({
          type: 'authenticated',
          data: {
            result: false
          }
        });
      }
    },
    'core.subscriberMessage': {
      'subscriberMessage': function(channel, message) {
        if (channel === this.cluster_name) {
          return this.emit('payload', this.parseJSON(message));
        }
      }
    },
    'core.payload.pingpong': {
      'payload': function(payload) {
        var _ref, _ref2;
        if ((_ref = this.server_id, __indexOf.call(payload.server_ids, _ref) >= 0) && ((_ref2 = payload.type) === 'ping' || _ref2 === 'pong')) {
          console.log("core.payload.pingpong");
          if (payload.type === 'ping') {
            return this.s2s({
              server_ids: [payload.origin_server_id],
              type: 'pong'
            });
          } else if (payload.type === 'pong') {
            return this.server_checkins[payload.origin_server_id] = true;
          }
        }
      }
    },
    'core.payload.messageToUserIds': {
      'payload': function(payload) {
        var ci, client_payload, session_keys, user_id;
        if (!(payload.user_ids.length > 0)) {
          return;
        }
        console.log("core.payload.messageToUserIds: " + (sys.inspect(payload.user_ids)));
        session_keys = (function() {
          var _i, _len, _ref, _results;
          _ref = payload.user_ids;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            user_id = _ref[_i];
            _results.push(this.rkey('user_id', user_id, 'session_ids'));
          }
          return _results;
        }).call(this);
        ci = this.socket.clients;
        client_payload = this.clientPayload(payload);
        return this.db.sunion(session_keys, __bind(function(err, session_ids) {
          return session_ids.forEach(__bind(function(session_id) {
            var cli;
            if (cli = ci[session_id]) {
              return cli.send(client_payload);
            }
          }, this));
        }, this));
      }
    },
    'core.payload.message': {
      'payload': function(payload) {
        var ci, client_payload;
        if (!(payload.session_ids.length > 0)) {
          return;
        }
        console.log("core.payload.message: " + (sys.inspect(payload)));
        ci = this.socket.clients;
        client_payload = this.clientPayload(payload);
        return payload.session_ids.forEach(__bind(function(session_id) {
          var cli;
          if (cli = ci[session_id]) {
            return cli.send(client_payload);
          }
        }, this));
      }
    },
    'core.subscriberUnsubscribed': {
      'subscriberUnsubscribed': function(channel, subscription_count) {
        console.log("Unsubscribe Received: Channel: " + channel + ", Subscription Count: " + subscription_count + ", Shutting Down: " + (!!this.subscriber.shutting_down));
        if (this.subscriber.shutting_down && subscription_count === 0) {
          return this.subscriber.quit();
        }
      }
    },
    'core.serverTimeout': {
      'serverTimeout': function(server_id) {
        console.log("core.serverTimeout for " + server_id);
        return this.emit('serverOffline', server_id);
      }
    },
    'core.serverOnline': {
      'serverOnline': function(server_id) {
        console.log("core.serverOnline: " + server_id);
        return this.emit('dbServerOnline', server_id);
      }
    },
    'core.serverOffline': {
      'serverOffline': function(server_id) {
        console.log("core.serverOffline: " + server_id);
        return this.emit('dbServerOffline', server_id);
      }
    },
    'core.serverSweep': {
      'serverSweep': function() {
        return this.emit('dbServerSweep');
      }
    },
    'core.pubsub': {
      'pubsub': function(client, channel, state) {
        return this.emit('dbPubSub', client.sessionId, channel, state);
      }
    }
  };
}).call(this);
