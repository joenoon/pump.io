(function() {
  var EventEmitter, Pump, clientVersion, connect, express, fs, io, random_number_between, redis, sys, url;
  var __hasProp = Object.prototype.hasOwnProperty, __extends = function(child, parent) {
    for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; }
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor;
    child.__super__ = parent.prototype;
    return child;
  }, __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  sys = require('sys');
  express = require('express');
  connect = require('connect');
  EventEmitter = require('events').EventEmitter;
  redis = require('redis');
  io = require('socket.io');
  fs = require('fs');
  url = require('url');
  clientVersion = '0.0.6';
  random_number_between = function(low, high) {
    return Math.floor(Math.random() * (high - low + 1)) + low;
  };
  Pump = (function() {
    __extends(Pump, EventEmitter);
    function Pump(options) {
      if (options == null) {
        options = {};
      }
      this.host = options.host || '0.0.0.0';
      this.port = options.port || 8080;
      this.redis_host = options.redis_host || '127.0.0.1';
      this.redis_port = options.redis_port || 6379;
      this.cluster_name = options.cluster_name || 'pumpcluster';
      this.static_resource = options.static_resource || 'pump.io';
      this.clientVersion = options.clientVersion || clientVersion;
      this.server_id = Math.random().toString().substr(2);
      this.server_checkins = {};
      this.__listeners = {};
      this._clientFiles = {};
      this.__last_sweeped_at = 0;
      this.server_sweeper = false;
      this.log = sys.log;
      this.server = express.createServer();
      this.server.use(__bind(function() {
        this._checkRequest.apply(this, arguments);
      }, this));
      this.server.use(connect.bodyDecoder());
      this.server.use(connect.methodOverride());
      this.server.use(connect.errorHandler({
        dumpExceptions: true,
        showStack: true
      }));
      this.server.use(this.server.router);
      this.server.post('/s2s', __bind(function(req, res) {
        if (this._checkAllowedRequest(res)) {
          res.writeHead(200, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            success: true
          }));
          this.s2s(req.body);
        } else {
          res.writeHead(403, {
            'Content-Type': 'application/json'
          });
          res.end(JSON.stringify({
            success: false
          }));
        }
      }, this));
    }
    Pump.prototype.listen = function(callback) {
      this.server.listen(this.port, this.host, callback);
      this.socket = io.listen(this.server);
      this.db = redis.createClient(this.redis_port, this.redis_host);
      this.publisher = redis.createClient(this.redis_port, this.redis_host);
      this.subscriber = redis.createClient(this.redis_port, this.redis_host);
      this.subscriber.subscribe(this.rkey(this.cluster_name, 'server', this.server_id));
      this.__bind_listeners();
      setTimeout(__bind(function() {
        this.__server_sweeper_interval = setInterval((__bind(function() {
          return this.emit('serverSweep');
        }, this)), 10000);
        this.__server_sweeper_primary_check_internal = setInterval((__bind(function() {
          return this.emit('serverSweepPrimaryCheck');
        }, this)), 60000);
      }, this), random_number_between(10, 120) * 1000);
      this.emit('serverOnline', this.server_id);
    };
    Pump.prototype.use = function(unique_name, type, fn) {
      var that;
      that = this;
      this.__listeners[unique_name] = function() {
        return fn.apply(that, arguments);
      };
      this.log("using listener on " + type + ": " + unique_name);
      this.on(type, this.__listeners[unique_name]);
    };
    Pump.prototype.useAll = function(hash) {
      var data, fn, type, unique_name;
      for (unique_name in hash) {
        data = hash[unique_name];
        for (type in data) {
          fn = data[type];
          this.use(unique_name, type, fn);
        }
      }
    };
    Pump.prototype.unuse = function(unique_name, type) {
      this.log("un-using listener on " + type + ": " + unique_name);
      this.removeListener(type, this.__listeners[unique_name]);
      delete this.__listeners[unique_name];
    };
    Pump.prototype.connectUse = function(fn) {
      return fn(connect);
    };
    Pump.prototype.rkey = function() {
      var arg, arr;
      arr = (function() {
        var _i, _len, _results;
        _results = [];
        for (_i = 0, _len = arguments.length; _i < _len; _i++) {
          arg = arguments[_i];
          _results.push(arg);
        }
        return _results;
      }).apply(this, arguments);
      arr.unshift(this.cluster_name);
      return "" + (arr.join(":"));
    };
    Pump.prototype.s2s = function(obj) {
      var server_id, session_id, session_keys, session_server_id_keys, user_id, _i, _len, _ref;
      if (typeof obj === 'string') {
        obj = JSON.parse(obj);
      }
      obj.origin_server_id = this.server_id;
      obj.data || (obj.data = {});
      obj.server_ids || (obj.server_ids = []);
      obj.session_ids || (obj.session_ids = []);
      obj.user_ids || (obj.user_ids = []);
      if (obj.user_ids.length > 0) {
        session_keys = (function() {
          var _i, _len, _ref, _results;
          _ref = obj.user_ids;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            user_id = _ref[_i];
            _results.push(this.rkey('user_id', user_id, 'session_ids'));
          }
          return _results;
        }).call(this);
        this.db.sunion(session_keys, __bind(function(err, session_ids) {
          obj.user_ids = [];
          obj.session_ids = session_ids;
          this.s2s(obj);
        }, this));
      } else if (obj.channel && obj.session_ids.length === 0) {
        this.db.smembers(this.rkey('channel', obj.channel, 'session_ids'), __bind(function(err, session_ids) {
          if (session_ids.length > 0) {
            obj.session_ids = session_ids;
            this.s2s(obj);
          }
        }, this));
      } else if (obj.server_ids.length > 0) {
        _ref = obj.server_ids;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          server_id = _ref[_i];
          obj.ts = new Date().getTime();
          this.publisher.publish(this.rkey(this.cluster_name, 'server', server_id), this.toJSON(obj));
        }
      } else if (obj.session_ids.length > 0) {
        session_server_id_keys = (function() {
          var _i, _len, _ref, _results;
          _ref = obj.session_ids;
          _results = [];
          for (_i = 0, _len = _ref.length; _i < _len; _i++) {
            session_id = _ref[_i];
            _results.push(this.rkey('session_id', session_id, 'server_id'));
          }
          return _results;
        }).call(this);
        this.db.mget(session_server_id_keys, __bind(function(err, session_server_ids) {
          var i, mapper, server_id, session_ids, _len;
          mapper = {};
          for (i = 0, _len = session_server_ids.length; i < _len; i++) {
            server_id = session_server_ids[i];
            if (server_id) {
              mapper[server_id] || (mapper[server_id] = []);
              mapper[server_id].push(obj.session_ids[i]);
            }
          }
          for (server_id in mapper) {
            session_ids = mapper[server_id];
            obj.session_ids = session_ids;
            obj.ts = new Date().getTime();
            this.publisher.publish(this.rkey(this.cluster_name, 'server', server_id), this.toJSON(obj));
          }
        }, this));
      } else {
        this.log("s2s not sent because no recipients: " + (sys.inspect(obj)));
      }
    };
    Pump.prototype.toJSON = function(obj) {
      try {
        if (typeof obj === 'object') {
          obj = JSON.stringify(obj);
        }
      } catch (err) {
        obj = JSON.stringify({});
      }
      return obj;
    };
    Pump.prototype.parseJSON = function(obj) {
      try {
        if (typeof obj === 'string') {
          obj = JSON.parse(obj);
        }
      } catch (err) {
        obj = {};
      }
      return obj;
    };
    Pump.prototype.parseIncoming = function(obj) {
      obj = this.parseJSON(obj);
      obj.data || (obj.data = {});
      return obj;
    };
    Pump.prototype.clientPayload = function(payload) {
      var client_payload, key, val;
      client_payload = {};
      for (key in payload) {
        val = payload[key];
        if (key !== 'server_ids' && key !== 'session_ids' && key !== 'user_ids' && key !== 'origin_server_id') {
          client_payload[key] = val;
        }
      }
      return client_payload;
    };
    Pump.prototype.resource = function(session_id, user_id) {
      var sid, uid;
      sid = session_id != null ? session_id : '';
      uid = user_id != null ? user_id : '';
      return "" + sid + "/" + uid;
    };
    Pump.prototype.__bind_listeners = function() {
      this.socket.on('clientMessage', __bind(function(message, client) {
        return this.emit('clientMessage', this.parseJSON(message), client);
      }, this));
      this.socket.on('clientConnect', __bind(function(client) {
        return this.emit('clientConnect', client);
      }, this));
      this.socket.on('clientDisconnect', __bind(function(client) {
        return this.emit('clientDisconnect', client);
      }, this));
      this.socket.on('disconnectAll', __bind(function() {
        return this.emit('disconnectAll');
      }, this));
      this.socket.on('serverTimeout', __bind(function(server_id) {
        return this.emit('serverTimeout', server_id);
      }, this));
      this.subscriber.on('message', __bind(function(channel, message) {
        return this.emit('subscriberMessage', channel, message);
      }, this));
      this.subscriber.on('unsubscribe', __bind(function(channel, subscription_count) {
        return this.emit('subscriberUnsubscribed', channel, subscription_count);
      }, this));
    };
    Pump.prototype._checkAllowedRequest = function(req) {
      return true;
    };
    Pump.prototype._checkRequest = function(req, res, next) {
      var parts, path;
      path = url.parse(req.url).pathname;
      if (path && path.indexOf('/' + this.static_resource) === 0) {
        parts = path.substr(2 + this.static_resource.length).split('/');
        if (this._serveClient(parts.join('/'), req, res)) {
          return true;
        }
      }
      return next();
    };
    Pump.prototype._serveClient = function(file, req, res) {
      var clientPaths, path, types, write;
      clientPaths = {
        'pump.io.js': 'pump.io.js'
      };
      types = {
        js: 'text/javascript'
      };
      write = __bind(function(path) {
        if (false && req.headers['if-none-match'] === this.clientVersion) {
          res.writeHead(304);
          return res.end();
        } else {
          res.writeHead(200, this._clientFiles[path].headers);
          return res.end(this._clientFiles[path].content, this._clientFiles[path].encoding);
        }
      }, this);
      path = clientPaths[file];
      if (req.method === 'GET' && (path != null)) {
        if (path in this._clientFiles) {
          write(path);
          return true;
        }
        fs.readFile(__dirname + '/../support/public/' + path, __bind(function(err, data) {
          var ext;
          if (err) {
            res.writeHead(404);
            return res.end('404');
          } else {
            ext = path.split('.').pop();
            this._clientFiles[path] = {
              headers: {
                'Content-Length': data.length,
                'Content-Type': types[ext],
                'ETag': this.clientVersion
              },
              content: data,
              encoding: 'utf8'
            };
            return write(path);
          }
        }, this));
        return true;
      }
      return false;
    };
    return Pump;
  })();
  Pump.core_listeners = require('./core_listeners.js');
  Pump.db_listeners = require('./db_listeners.js');
  Pump.stub_listeners = require('./stub_listeners.js');
  module.exports = Pump;
}).call(this);
