(function() {
  var Pump;
  var __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  }, __hasProp = Object.prototype.hasOwnProperty, __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  Pump = (function() {
    function Pump(options) {
      var key, socket_options, val;
      options = options != null ? options : {};
      this.host = window.location.hostname;
      this.port = 8080;
      this.rememberTransport = false;
      this.reconnect = true;
      this.secure = false;
      this.handlers = {};
      this.roster = {};
      this.user_sessions_hash = {};
      this.session_user_hash = {};
      for (key in options) {
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
    }
    Pump.prototype.proxy = function(fn) {
      var that;
      that = this;
      return function() {
        return fn.apply(that, arguments);
      };
    };
    Pump.prototype.send = function(obj) {
      obj || (obj = {});
      if (typeof obj !== 'string') {
        try {
          obj = JSON.stringify(obj);
        } catch (err) {
          null;
        }
      }
      if (obj) {
        this.socket.send(obj);
      }
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
      return this.socket.connect();
    };
    Pump.prototype.subscribe = function(channel, state) {
      if (state == null) {
        state = 'available';
      }
      return this.send({
        type: 'presence',
        channel: channel,
        data: {
          state: state
        }
      });
    };
    Pump.prototype.unsubscribe = function(channel) {
      return this.subscribe(channel, 'unavailable');
    };
    Pump.prototype.on = function(name, fn) {
      if (!(name && fn)) {
        return;
      }
      name = "pump" + name;
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
      name = "pump" + name;
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
      name = "pump" + name;
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
    Pump.prototype.onConnect = function() {
      this.sessionId = this.socket.transport.sessionid;
      return this.emit('connect');
    };
    Pump.prototype.onDisconnect = function() {
      this.sessionId = null;
      this.emit('disconnect');
      if (this.reconnect) {
        return this.doReconnect();
      }
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
      if (data.type === 'presence') {
        this._rosterHandler(data);
      }
      return this.emit('message', data);
    };
    Pump.prototype._rosterHandler = function(payload) {
      var key, session_id, state, user_id;
      if (!payload.from) {
        return;
      }
      key = payload.channel ? payload.channel : 'global';
      if (!(key in this.roster)) {
        this.roster[key] = {};
      }
      session_id = this.sessionIdFromResource(payload.from);
      user_id = this.userIdFromResource(payload.from);
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
          if (session_id in this.roster[key]) {
            delete this.roster[key][session_id];
            this.emit('presenceChanged', {
              channel: key,
              state: state,
              session_id: session_id,
              user_id: user_id,
              data: payload.data
            });
          }
        } else {
          this.roster[key][session_id] = state;
          this.emit('presenceChanged', {
            channel: key,
            state: state,
            session_id: session_id,
            user_id: user_id,
            data: payload.data
          });
        }
      }
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
    Pump.prototype.doReconnect = function() {
      var clear, reconnect;
      if (this._reconnectInterval) {
        return;
      }
      clear = __bind(function() {
        clearInterval(this._reconnectInterval);
        return this._reconnectInterval = null;
      }, this);
      reconnect = __bind(function() {
        if (this.socket.connecting) {
          ;
        } else if (this.socket.connected) {
          return clear();
        } else {
          this.emit('reconnecting');
          return this.connect();
        }
      }, this);
      return this._reconnectInterval = setInterval(reconnect, 3000);
    };
    return Pump;
  })();
  this.Pump = Pump;
}).call(this);
