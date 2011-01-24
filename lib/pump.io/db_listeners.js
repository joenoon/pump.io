(function() {
  var sys;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  sys = require('sys');
  module.exports = {
    'core.dbClientConnect': {
      'dbClientConnect': function(server_id, session_id) {
        console.log("core.dbClientConnect: " + server_id + ", " + session_id);
        return this.db.sadd(this.rkey('server_id', server_id, 'session_ids'), session_id);
      }
    },
    'core.dbClientDisconnect': {
      'dbClientDisconnect': function(server_id, session_id) {
        console.log("core.dbClientDisconnect: " + server_id + ", " + session_id);
        this.emit('dbPubSubLeaveAll', session_id);
        this.db.srem(this.rkey('server_id', server_id, 'session_ids'), session_id);
        return this.db.get(this.rkey('session_id', session_id, 'user_id'), __bind(function(err, user_id) {
          this.db.srem(this.rkey('user_id', user_id, 'session_ids'), session_id);
          return this.db.del(this.rkey('session_id', session_id, 'user_id'));
        }, this));
      }
    },
    'core.dbAuthenticated': {
      'dbAuthenticated': function(session_id, user_id) {
        console.log("core.dbAuthenticated: " + session_id + ", " + user_id);
        this.db.set(this.rkey('session_id', session_id, 'user_id'), user_id);
        return this.db.sadd(this.rkey('user_id', user_id, 'session_ids'), session_id);
      }
    },
    'core.dbServerOnline': {
      'dbServerOnline': function(server_id) {
        console.log("core.dbServerOnline: " + server_id);
        return this.db.sadd(this.rkey('server_ids'), server_id);
      }
    },
    'core.dbServerOffline': {
      'dbServerOffline': function(server_id) {
        console.log("core.dbServerOffline: " + server_id);
        this.db.srem(this.rkey('server_ids'), server_id);
        return this.db.smembers(this.rkey('server_id', server_id, 'session_ids'), __bind(function(err, session_ids) {
          session_ids.forEach(__bind(function(session_id) {
            return this.emit('dbClientDisconnect', server_id, session_id);
          }, this));
          return this.db.del(this.rkey('server_id', server_id, 'session_ids'));
        }, this));
      }
    },
    'core.dbServerSweep': {
      'dbServerSweep': function() {
        if (this.server_sweeping) {
          return;
        }
        console.log("core.dbServerSweep");
        this.server_sweeping = true;
        return this.db.smembers(this.rkey('server_ids'), __bind(function(err, server_ids) {
          var server_id, _i, _len;
          this.server_checkins = {};
          for (_i = 0, _len = server_ids.length; _i < _len; _i++) {
            server_id = server_ids[_i];
            this.server_checkins[server_id] = false;
          }
          this.s2s({
            server_ids: server_ids,
            type: 'ping'
          });
          setTimeout(__bind(function() {
            var server_id, _i, _len;
            for (_i = 0, _len = server_ids.length; _i < _len; _i++) {
              server_id = server_ids[_i];
              if (!this.server_checkins[server_id]) {
                this.socket.emit('serverTimeout', server_id);
              }
            }
            return null;
          }, this), 5000);
          return this.server_sweeping = false;
        }, this));
      }
    },
    'core.dbPubSub': {
      'dbPubSub': function(session_id, channel, state) {
        var presence;
        console.log("core.dbPubSub: " + session_id + ", " + channel + ", " + state);
        presence = state === 'subscribed' ? false : true;
        if (state === 'unavailable') {
          return this.db.srem(this.rkey('session_id', session_id, 'channels'), channel, __bind(function(err, performed) {
            return this.db.srem(this.rkey('channel', channel, 'session_ids'), session_id, __bind(function(err, res) {
              return this.db.get(this.rkey('channel', channel, 'session_id', session_id, 'state'), __bind(function(err, res) {
                presence = res === 'subscribed' ? false : true;
                return this.db.del(this.rkey('channel', channel, 'session_id', session_id, 'state'), __bind(function(err, res) {
                  if (presence) {
                    return this.db.smembers(this.rkey('channel', channel, 'session_ids'), __bind(function(err, session_ids) {
                      return this.db.get(this.rkey('session_id', session_id, 'user_id'), __bind(function(err, user_id) {
                        if (performed === 1) {
                          return this.s2s({
                            type: 'presence',
                            from: this.resource(session_id, user_id),
                            session_ids: session_ids,
                            data: {
                              channel: channel,
                              state: 'unavailable'
                            }
                          });
                        }
                      }, this));
                    }, this));
                  }
                }, this));
              }, this));
            }, this));
          }, this));
        } else {
          return this.db.sadd(this.rkey('session_id', session_id, 'channels'), channel, __bind(function(err, performed) {
            return this.db.sadd(this.rkey('channel', channel, 'session_ids'), session_id, __bind(function(err, res) {
              return this.db.set(this.rkey('channel', channel, 'session_id', session_id, 'state'), state, __bind(function(err, res) {
                if (presence) {
                  return this.db.smembers(this.rkey('channel', channel, 'session_ids'), __bind(function(err, session_ids) {
                    var sid, state_keys, user_id_keys;
                    state_keys = (function() {
                      var _i, _len, _results;
                      _results = [];
                      for (_i = 0, _len = session_ids.length; _i < _len; _i++) {
                        sid = session_ids[_i];
                        _results.push(this.rkey('channel', channel, 'session_id', sid, 'state'));
                      }
                      return _results;
                    }).call(this);
                    user_id_keys = (function() {
                      var _i, _len, _results;
                      _results = [];
                      for (_i = 0, _len = session_ids.length; _i < _len; _i++) {
                        sid = session_ids[_i];
                        _results.push(this.rkey('session_id', sid, 'user_id'));
                      }
                      return _results;
                    }).call(this);
                    return this.db.mget(state_keys, __bind(function(err, states) {
                      return this.db.mget(user_id_keys, __bind(function(err, user_ids) {
                        var i, sid, _len, _results;
                        this.s2s({
                          type: 'presence',
                          from: this.resource(session_id, user_ids[session_ids.indexOf(session_id)]),
                          session_ids: session_ids,
                          data: {
                            channel: channel,
                            state: state
                          }
                        });
                        if (performed === 1) {
                          _results = [];
                          for (i = 0, _len = session_ids.length; i < _len; i++) {
                            sid = session_ids[i];
                            _results.push(sid !== session_id ? states[i] !== 'subscribed' ? this.s2s({
                              type: 'presence',
                              from: this.resource(sid, user_ids[i]),
                              session_ids: [session_id],
                              data: {
                                channel: channel,
                                state: states[i]
                              }
                            }) : void 0 : void 0);
                          }
                          return _results;
                        }
                      }, this));
                    }, this));
                  }, this));
                }
              }, this));
            }, this));
          }, this));
        }
      }
    },
    'core.dbPubSubLeaveAll': {
      'dbPubSubLeaveAll': function(session_id) {
        console.log("core.dbPubSubLeaveAll: " + session_id);
        return this.db.smembers(this.rkey('session_id', session_id, 'channels'), __bind(function(err, channels) {
          var channel, _i, _len, _results;
          _results = [];
          for (_i = 0, _len = channels.length; _i < _len; _i++) {
            channel = channels[_i];
            _results.push(this.emit('dbPubSub', session_id, channel, 'unavailable'));
          }
          return _results;
        }, this));
      }
    }
  };
}).call(this);
