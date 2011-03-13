(function() {
  var sys;
  var __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  };
  sys = require('sys');
  module.exports = {
    'core.clientConnect': {
      'clientConnect': function(client) {
        this.log("core.clientConnect: " + client.sessionId);
        client.pump = this;
        this.emit('dbClientConnect', this.server_id, client.sessionId);
      }
    },
    'core.clientDisconnect': {
      'clientDisconnect': function(client) {
        this.log("core.clientDisconnect: " + client.sessionId);
        this.emit('dbClientDisconnect', this.server_id, client.sessionId);
      }
    },
    'core.disconnectAll': {
      'disconnectAll': function() {
        var client, client_id, _ref;
        this.log("core.disconnectAll");
        _ref = this.socket.clients;
        for (client_id in _ref) {
          client = _ref[client_id];
          client._onClose();
        }
      }
    },
    'core.clientMessage': {
      'clientMessage': function(message, client) {
        message = this.parseIncoming(message);
        this.log("core.clientMessage: " + message.type + ", " + client.sessionId);
        if (message.type === 'authenticate') {
          this.emit('authenticate', message, client);
        } else if (message.type === 'presence' && message.channel) {
          this.emit('pubsubCheck', message, client);
        } else if (message.type === 'ping') {
          message.type = 'pong';
          client.send(message);
        }
      }
    },
    'core.authenticationSuccess': {
      'authenticationSuccess': function(message, client) {
        this.log("core.authenticationSuccess: " + client.sessionId + ", " + message.data.user_id);
        client.user_id = message.data.user_id;
        client.authenticated = true;
        message.type = 'authenticated';
        client.send(message);
        this.emit('dbAuthenticated', client.sessionId, client.user_id);
      }
    },
    'core.authenticationFailed': {
      'authenticationFailed': function(message, client) {
        this.log("core.authenticationFailed: " + client.sessionId);
        message.type = 'authentication_failed';
        client.send(message);
      }
    },
    'core.subscriberMessage': {
      'subscriberMessage': function(channel, message) {
        this.emit('payload', this.parseJSON(message));
      }
    },
    'core.payload.pingpong': {
      'payload': function(payload) {
        var _ref, _ref2;
        if ((_ref = this.server_id, __indexOf.call(payload.server_ids, _ref) >= 0) && ((_ref2 = payload.type) === 'ping' || _ref2 === 'pong')) {
          if (payload.type === 'ping') {
            this.__last_sweeped_at = new Date().getTime();
            if (payload.origin_server_id !== this.server_id) {
              this.server_sweeper = false;
            }
            this.s2s({
              server_ids: [payload.origin_server_id],
              type: 'pong'
            });
          } else if (payload.type === 'pong') {
            this.server_checkins[payload.origin_server_id] = true;
          }
        }
      }
    },
    'core.payload.message': {
      'payload': function(payload) {
        var ci, client_payload, session_id, _i, _len, _ref;
        if (!(payload.session_ids.length > 0)) {
          return;
        }
        this.log("core.payload.message: type: " + payload.type + ", session_ids: " + (payload.session_ids.join(',')));
        ci = this.socket.clients;
        client_payload = this.clientPayload(payload);
        _ref = payload.session_ids;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          session_id = _ref[_i];
          if (session_id in ci) {
            ci[session_id].send(client_payload);
          }
        }
      }
    },
    'core.subscriberUnsubscribed': {
      'subscriberUnsubscribed': function(channel, subscription_count) {
        this.log("Unsubscribe Received: Channel: " + channel + ", Subscription Count: " + subscription_count + ", Shutting Down: " + (!!this.subscriber.shutting_down));
        if (this.subscriber.shutting_down && subscription_count === 0) {
          this.subscriber.quit();
        }
      }
    },
    'core.serverTimeout': {
      'serverTimeout': function(server_id) {
        this.log("core.serverTimeout for " + server_id);
        this.emit('serverOffline', server_id);
      }
    },
    'core.serverOnline': {
      'serverOnline': function(server_id) {
        this.log("core.serverOnline: " + server_id);
        this.emit('dbServerOnline', server_id);
      }
    },
    'core.serverOffline': {
      'serverOffline': function(server_id) {
        this.log("core.serverOffline: " + server_id);
        this.emit('dbServerOffline', server_id);
      }
    },
    'core.serverSweep': {
      'serverSweep': function() {
        this.emit('dbServerSweep');
      }
    },
    'core.serverSweepPrimaryCheck': {
      'serverSweepPrimaryCheck': function() {
        if (new Date().getTime() - this.__last_sweeped_at > 60000) {
          this.server_sweeper = true;
        }
      }
    },
    'core.pubsub': {
      'pubsub': function(client, channel, data, rid) {
        this.emit('dbPubSub', client.sessionId, channel, data, rid);
      }
    }
  };
}).call(this);
