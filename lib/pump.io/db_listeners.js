(function() {
  var sys;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  sys = require('sys');
  module.exports = {
    'core.dbClientConnect': {
      'dbClientConnect': function(server_id, session_id) {
        this.log("core.dbClientConnect: " + server_id + ", " + session_id);
        this.db.sadd(this.rkey('server_id', server_id, 'session_ids'), session_id);
        this.db.set(this.rkey('session_id', session_id, 'server_id'), server_id);
      }
    },
    'core.dbClientDisconnect': {
      'dbClientDisconnect': function(server_id, session_id) {
        this.log("core.dbClientDisconnect: " + server_id + ", " + session_id);
        this.emit('dbPubSubLeaveAll', session_id);
        this.db.del(this.rkey('session_id', session_id, 'server_id'));
        this.db.srem(this.rkey('server_id', server_id, 'session_ids'), session_id);
        this.db.get(this.rkey('session_id', session_id, 'user_id'), __bind(function(err, user_id) {
          this.db.srem(this.rkey('user_id', user_id, 'session_ids'), session_id);
          this.db.del(this.rkey('session_id', session_id, 'user_id'));
        }, this));
      }
    },
    'core.dbAuthenticated': {
      'dbAuthenticated': function(session_id, user_id) {
        this.log("core.dbAuthenticated: " + session_id + ", " + user_id);
        this.db.set(this.rkey('session_id', session_id, 'user_id'), user_id);
        this.db.sadd(this.rkey('user_id', user_id, 'session_ids'), session_id);
      }
    },
    'core.dbServerOnline': {
      'dbServerOnline': function(server_id) {
        this.log("core.dbServerOnline: " + server_id);
        this.db.sadd(this.rkey('server_ids'), server_id);
      }
    },
    'core.dbServerOffline': {
      'dbServerOffline': function(server_id) {
        this.log("core.dbServerOffline: " + server_id);
        this.db.srem(this.rkey('server_ids'), server_id);
        this.db.smembers(this.rkey('server_id', server_id, 'session_ids'), __bind(function(err, session_ids) {
          var session_id, _i, _len;
          for (_i = 0, _len = session_ids.length; _i < _len; _i++) {
            session_id = session_ids[_i];
            this.emit('dbClientDisconnect', server_id, session_id);
          }
          this.db.del(this.rkey('server_id', server_id, 'session_ids'));
        }, this));
      }
    },
    'core.dbServerSweep': {
      'dbServerSweep': function() {
        if (this.server_sweeping) {
          return;
        }
        this.log("core.dbServerSweep");
        this.server_sweeping = true;
        this.db.smembers(this.rkey('server_ids'), __bind(function(err, server_ids) {
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
            this.emit('serversSweeped');
          }, this), 5000);
          this.server_sweeping = false;
        }, this));
      }
    },
    'core.dbPubSub': {
      'dbPubSub': function(session_id, channel, data) {
        var data_s, presence, state;
        this.log("core.dbPubSub: " + session_id + ", " + channel + ", state: " + data.state);
        data.state || (data.state = 'available');
        state = data.state;
        presence = state === 'subscribed' ? false : true;
        if (state === 'unavailable') {
          this.db.srem(this.rkey('session_id', session_id, 'channels'), channel, __bind(function(err, res) {
            this.db.srem(this.rkey('channel', channel, 'session_ids'), session_id, __bind(function(err, res) {
              this.db.get(this.rkey('channel', channel, 'session_id', session_id, 'data'), __bind(function(err, current_data) {
                current_data = this.parseJSON(current_data) || {};
                presence = current_data.state === 'subscribed' ? false : true;
                this.db.del(this.rkey('channel', channel, 'session_id', session_id, 'data'), __bind(function(err, res) {
                  if (presence) {
                    this.db.smembers(this.rkey('channel', channel, 'session_ids'), __bind(function(err, session_ids) {
                      this.db.get(this.rkey('session_id', session_id, 'user_id'), __bind(function(err, user_id) {
                        this.s2s({
                          type: 'presence',
                          from: this.resource(session_id, user_id),
                          session_ids: session_ids.concat([session_id]),
                          channel: channel,
                          data: {
                            state: 'unavailable'
                          }
                        });
                      }, this));
                    }, this));
                  }
                }, this));
              }, this));
            }, this));
          }, this));
        } else {
          data_s = this.toJSON(data);
          this.db.sadd(this.rkey('session_id', session_id, 'channels'), channel, __bind(function(err, performed) {
            this.db.sadd(this.rkey('channel', channel, 'session_ids'), session_id, __bind(function(err, res) {
              this.db.set(this.rkey('channel', channel, 'session_id', session_id, 'data'), data_s, __bind(function(err, res) {
                if (presence) {
                  this.db.smembers(this.rkey('channel', channel, 'session_ids'), __bind(function(err, session_ids) {
                    var data_keys, sid, user_id_keys;
                    data_keys = (function() {
                      var _i, _len, _results;
                      _results = [];
                      for (_i = 0, _len = session_ids.length; _i < _len; _i++) {
                        sid = session_ids[_i];
                        _results.push(this.rkey('channel', channel, 'session_id', sid, 'data'));
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
                    this.db.mget(data_keys, __bind(function(err, datas) {
                      this.db.mget(user_id_keys, __bind(function(err, user_ids) {
                        var data_i, i, sid, _len;
                        this.s2s({
                          type: 'presence',
                          from: this.resource(session_id, user_ids[session_ids.indexOf(session_id)]),
                          session_ids: session_ids,
                          channel: channel,
                          data: data
                        });
                        if (performed === 1) {
                          for (i = 0, _len = session_ids.length; i < _len; i++) {
                            sid = session_ids[i];
                            if (sid !== session_id) {
                              data_i = datas[i];
                              if (data_i) {
                                data_i = this.parseJSON(data_i);
                                if (data_i.state !== 'subscribed') {
                                  this.s2s({
                                    type: 'presence',
                                    from: this.resource(sid, user_ids[i]),
                                    session_ids: [session_id],
                                    channel: channel,
                                    data: data_i
                                  });
                                }
                              }
                            }
                          }
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
        this.log("core.dbPubSubLeaveAll: " + session_id);
        this.db.smembers(this.rkey('session_id', session_id, 'channels'), __bind(function(err, channels) {
          var channel, _i, _len;
          for (_i = 0, _len = channels.length; _i < _len; _i++) {
            channel = channels[_i];
            this.emit('dbPubSub', session_id, channel, {
              state: 'unavailable'
            });
          }
        }, this));
      }
    }
  };
}).call(this);
