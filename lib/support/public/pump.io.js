(function() {
  var Pump;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
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
        type: 'pubsub',
        data: {
          channel: channel,
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
      return this.emit('message', data);
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
