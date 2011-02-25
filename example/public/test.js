(function() {
  var TestCase;
  var __indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++) {
      if (this[i] === item) return i;
    }
    return -1;
  }, __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  window.WEB_SOCKET_DEBUG = true;
  window.WEB_SOCKET_SWF_LOCATION = 'http://www.realtime.dev:3001/socket.io/lib/vendor/web-socket-js/WebSocketMain.swf';
  TestCase = (function() {
    function TestCase() {
      this.type = null;
      this.types = ['websocket', 'flashsocket', 'htmlfile', 'xhr-multipart', 'xhr-polling', 'jsonp-polling'];
      try {
        this.type = document.location.toString().match(/use=(.*)/)[1];
      } catch (err) {
        null;
      }
    }
    TestCase.prototype.log = function(str) {
      return $('#content').prepend($('<div></div>').html(str));
    };
    TestCase.prototype.start = function() {
      var l, _ref;
      if ((!this.type) || !(_ref = this.type, __indexOf.call(this.types, _ref) >= 0)) {
        l = document.location;
        this.log("Open " + l.protocol + "//" + l.hostname + ":" + l.port + "/index.html?use=TYPE where TYPE is one of " + (this.types.join(', ')));
      } else {
        this.log("Initializing testcase with " + this.type);
        this.setupPump();
      }
    };
    TestCase.prototype.setupPump = function() {
      var servers_sweeped;
      this.pump = new Pump({
        host: 'www.realtime.dev',
        port: 3001,
        transports: [this.type]
      });
      this.pump.on('connect', __bind(function() {
        this.log(this.pump.socket.transport.sessionid + " " + this.pump.socket.transport.type + " Connected!");
        return this.pump.send({
          type: 'presence',
          channel: 'test_channel',
          data: {
            state: 'available'
          }
        });
      }, this));
      this.pump.on('startTest', __bind(function() {
        return this.log($("<button>Send 5 messages</button>").click(__bind(function() {
          var i;
          for (i = 1; i <= 5; i++) {
            this.pump.send({
              type: 'presence',
              channel: 'test_channel',
              data: {
                state: 'available',
                message: "HI " + i
              }
            });
          }
          return false;
        }, this)));
      }, this));
      this.pump.on('presence', __bind(function(data) {
        if (data.data && data.data.message) {
          return this.log("" + data.from + " --- " + data.data.message);
        }
      }, this));
      this.pump.on('presenceChanged', __bind(function(data) {
        return $('#presence').html(JSON.stringify(this.pump.roster));
      }, this));
      servers_sweeped = __bind(function() {
        this.log("Server sweep has occurred");
        this.pump.removeEvent('serversSweeped', servers_sweeped);
        return this.pump.emit('startTest');
      }, this);
      this.pump.on('serversSweeped', servers_sweeped);
      this.pump.on('message', __bind(function(data) {
        console.log('got message');
        return this.log(JSON.stringify(data));
      }, this));
      return this.pump.connect();
    };
    return TestCase;
  })();
  $(function() {
    window.test = new TestCase;
    return window.test.start();
  });
}).call(this);
