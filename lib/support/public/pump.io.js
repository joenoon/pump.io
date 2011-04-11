(function() {
  var Pump, rid_counter;
  var __hasProp = Object.prototype.hasOwnProperty, __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; }, __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  };
  rid_counter = parseInt(Math.random().toString().substr(2, 6), 10);
  Pump = (function() {
    function Pump(options) {
      var key, socket_options, val;
      options = options != null ? options : {};
      this.host = window.location.hostname;
      this.port = 8080;
      this.rememberTransport = false;
      this.secure = false;
      this.handlers = {};
      this.roster = {};
      this.mypresence = {};
      this.user_sessions_hash = {};
      this.session_user_hash = {};
      for (key in options) {
        if (!__hasProp.call(options, key)) continue;
        val = options[key];
        this[key] = val;
      }
      socket_options = {
        rememberTransport: this.rememberTransport,
        port: this.port,
        secure: this.secure
      };
      if (this.transports) {
        socket_options.transports = this.transports;
      }
      this.socket = new io.Socket(this.host, socket_options);
      this.socket.on('connect', this.proxy(this.onConnect));
      this.socket.on('message', this.proxy(this.onMessage));
      this.socket.on('disconnect', this.proxy(this.onDisconnect));
      if (this.debug) {
        this.socket.on('connect', function() {
          return console.log('DEBUG: connect');
        });
        this.socket.on('connecting', function(transport_type) {
          return console.log('DEBUG: connecting', transport_type);
        });
        this.socket.on('connect_failed', function() {
          return console.log('DEBUG: connect_failed');
        });
        this.socket.on('message', function(message) {
          return console.log('DEBUG: message', message);
        });
        this.socket.on('close', function() {
          return console.log('DEBUG: close');
        });
        this.socket.on('disconnect', function() {
          return console.log('DEBUG: disconnect');
        });
        this.socket.on('reconnect', function(transport_type, reconnectionAttempts) {
          return console.log('DEBUG: reconnect', transport_type, reconnectionAttempts);
        });
        this.socket.on('reconnecting', function(reconnectionDelay, reconnectionAttempts) {
          return console.log('DEBUG: reconnecting', reconnectionDelay, reconnectionAttempts);
        });
        this.socket.on('reconnect_failed', function() {
          return console.log('DEBUG: reconnect_failed');
        });
      }
    }
    Pump.prototype.rid = function() {
      return rid_counter++;
    };
    Pump.prototype.proxy = function(fn) {
      var that;
      that = this;
      return function() {
        return fn.apply(that, arguments);
      };
    };
    Pump.prototype.send = function(obj, callback) {
      var key, rid, str;
      if (obj == null) {
        obj = {};
      }
      if (callback == null) {
        callback = null;
      }
      if (typeof obj !== 'object') {
        throw new Error('send requires an object');
      }
      if (!obj.type) {
        return;
      }
      if (typeof callback === 'function') {
        rid = this.rid();
        obj.rid = rid;
        this.on("rid_" + rid, __bind(function() {
          this.removeAllEvents("rid_" + rid);
          callback.apply(this, arguments);
        }, this));
      }
      if (obj.type === 'presence' && obj.data) {
        key = obj.channel;
        if (obj.data === 'unavailable') {
          delete this.mypresence[key];
        } else {
          this.mypresence[key] = obj;
        }
      }
      str = JSON.stringify(obj);
      this.socket.send(str);
      return this;
    };
    Pump.prototype.userIdFromResource = function(str) {
      var parts;
      parts = str.toString().split("/");
      if (parts.length === 2) {
        return parts[1];
      } else {
        return "";
      }
    };
    Pump.prototype.sessionIdFromResource = function(str) {
      var parts;
      parts = str.toString().split("/");
      if (parts.length === 2) {
        return parts[0];
      } else {
        return "";
      }
    };
    Pump.prototype.connect = function() {
      var _ref;
      if ((_ref = this.state) === 'connected' || _ref === 'connecting') {
        return;
      }
      this.state = 'connecting';
      this.socket.connect();
    };
    Pump.prototype.subscribe = function(channel, state) {
      if (state == null) {
        state = 'available';
      }
      this.send({
        type: 'presence',
        channel: channel,
        data: {
          state: state
        }
      });
    };
    Pump.prototype.unsubscribe = function(channel) {
      this.subscribe(channel, 'unavailable');
    };
    Pump.prototype.on = function(name, fn) {
      if (!(name && fn)) {
        return;
      }
      if (!(name in this.handlers)) {
        this.handlers[name] = [];
      }
      this.handlers[name].push(fn);
      return this;
    };
    Pump.prototype.emit = function() {
      var arg, args, events, fn, name, _i, _len;
      args = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = arguments.length; _i < _len; _i++) {
          arg = arguments[_i];
          _results.push(arg);
        }
        return _results;
      }).apply(this, arguments);
      name = args.shift();
      if (!name) {
        return;
      }
      if (name in this.handlers) {
        events = this.handlers[name].concat();
        for (_i = 0, _len = events.length; _i < _len; _i++) {
          fn = events[_i];
          fn.apply(this, args);
        }
      }
      return this;
    };
    Pump.prototype.removeEvent = function(name, fn) {
      var i, _len, _ref;
      if (!name) {
        return;
      }
      if (name in this.handlers) {
        _ref = this.handlers[name];
        for (i = 0, _len = _ref.length; i < _len; i++) {
          fn = _ref[i];
          if (this.handlers[name][i] === fn) {
            this.handlers[name].splice(i, 1);
          }
        }
      }
      return this;
    };
    Pump.prototype.removeAllEvents = function(name) {
      if (!name) {
        return delete this.handlers[name];
      }
      return this;
    };
    Pump.prototype.onConnect = function() {
      this.sessionId = this.socket.transport.sessionid;
      this.state = 'connected';
      this.emit('connect');
      this._resendPresences();
    };
    Pump.prototype.onDisconnect = function() {
      this.sessionId = null;
      this.state = 'disconnected';
      this.emit('disconnect');
    };
    Pump.prototype.onMessage = function(data) {
      data || (data = {});
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (err) {
          data = {};
        }
      }
      if (data.type) {
        if (data.rid) {
          this._ridHandler(data);
        }
        if (data.type === 'presence') {
          this._rosterHandler(data);
        }
        if (data.ts) {
          this._timeHandler(data);
        }
        this.emit(data.type, data);
      }
    };
    Pump.prototype._rosterHandler = function(payload) {
      var changed, key, session_id, state, user_id;
      if (!payload.from) {
        return;
      }
      key = payload.channel ? payload.channel : 'global';
      if (!(key in this.roster)) {
        this.roster[key] = {};
      }
      session_id = this.sessionIdFromResource(payload.from);
      user_id = this.userIdFromResource(payload.from);
      changed = false;
      if (session_id && user_id) {
        this.session_user_hash[session_id] = user_id;
        if (!(user_id in this.user_sessions_hash)) {
          this.user_sessions_hash[user_id] = [];
        }
        if (__indexOf.call(this.user_sessions_hash[user_id], session_id) < 0) {
          this.user_sessions_hash[user_id].push(session_id);
        }
      }
      if (session_id && payload.data) {
        state = payload.data.state;
        if (state === 'unavailable') {
          if (session_id === this.sessionId) {
            if (key === 'global') {
              this.roster = {};
            } else {
              if (key in this.roster) {
                this.roster[key] = {};
              }
              delete this.mypresence[key];
            }
            changed = true;
          } else {
            if (session_id in this.roster[key]) {
              delete this.roster[key][session_id];
              changed = true;
            }
          }
        } else {
          this.roster[key][session_id] = state;
          changed = true;
        }
      }
      if (changed) {
        this.emit('presenceChanged', {
          channel: key,
          state: state,
          session_id: session_id,
          user_id: user_id,
          data: payload.data
        });
      }
    };
    Pump.prototype._resendPresences = function() {
      var key, value, _ref;
      if (this.debug) {
        console.log('DEBUG: _resendPresences', this.mypresence);
      }
      _ref = this.mypresence;
      for (key in _ref) {
        if (!__hasProp.call(_ref, key)) continue;
        value = _ref[key];
        if (value) {
          this.send(value);
        }
      }
    };
    Pump.prototype._timeHandler = function(payload) {
      var client_time, server_time;
      client_time = new Date().getTime();
      server_time = payload.ts;
      this.time_delta = client_time - server_time;
    };
    Pump.prototype._ridHandler = function(payload) {
      this.emit("rid_" + payload.rid, payload);
    };
    Pump.prototype.adjustedEpoch = function(epoch_mil) {
      var time_delta;
      time_delta = this.time_delta || 0;
      return epoch_mil + time_delta;
    };
    Pump.prototype.userSessionsInArea = function(key, user_id) {
      var area, session_id, session_ids, session_ids_in_area, _i, _len;
      session_ids_in_area = {};
      if (key in this.roster) {
        area = this.roster[key];
        session_ids = this.user_sessions_hash[user_id] || [];
        for (_i = 0, _len = session_ids.length; _i < _len; _i++) {
          session_id = session_ids[_i];
          if (session_id in area) {
            session_ids_in_area[session_id] = area[session_id];
          }
        }
      }
      return session_ids_in_area;
    };
    Pump.prototype.rosterCount = function(key) {
      var area, count;
      count = 0;
      if (key in this.roster) {
        area = this.roster[key];
        for (key in area) {
          if (!__hasProp.call(area, key)) continue;
          count += 1;
        }
      }
      return count;
    };
    return Pump;
  })();
  this.Pump = Pump;
}).call(this);
