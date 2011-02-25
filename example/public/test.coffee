window.WEB_SOCKET_DEBUG = true
window.WEB_SOCKET_SWF_LOCATION = 'http://www.realtime.dev:3001/socket.io/lib/vendor/web-socket-js/WebSocketMain.swf';
# Assumes youve set up www.realtime.dev in hosts file to test cross-site
class TestCase
  constructor: ->
    @type = null
    @types = [ 'websocket', 'flashsocket', 'htmlfile', 'xhr-multipart', 'xhr-polling', 'jsonp-polling' ]
    try
      @type = document.location.toString().match(/use=(.*)/)[1]
    catch err
      null
  log: (str) ->
    $('#content').prepend($('<div></div>').html(str))
  start: ->
    if (!@type) || !(@type in @types)
      l = document.location
      @log "Open #{l.protocol}//#{l.hostname}:#{l.port}/index.html?use=TYPE where TYPE is one of #{@types.join(', ')}"
    else
      @log "Initializing testcase with #{@type}"
      @setupPump()
    return
  setupPump: ->
    @pump = new Pump
      host: 'www.realtime.dev'
      port: 3001
      transports: [@type]
    @pump.on 'connect', =>
      @log @pump.socket.transport.sessionid+" "+@pump.socket.transport.type+" Connected!"
      @pump.send { type: 'presence', channel: 'test_channel', data: { state: 'available' } }
    @pump.on 'startTest', () =>
      @log $("<button>Send 5 messages</button>").click () =>
        for i in [1..5]
          @pump.send { type: 'presence', channel: 'test_channel', data: { state: 'available', message: "HI #{i}" } }
        return false
    @pump.on 'presence', (data) =>
      if data.data && data.data.message
        @log "#{data.from} --- #{data.data.message}"
    @pump.on 'presenceChanged', (data) =>
      $('#presence').html(JSON.stringify(@pump.roster))
    servers_sweeped = () =>
      @log "Server sweep has occurred"
      @pump.removeEvent 'serversSweeped', servers_sweeped
      @pump.emit 'startTest'
    @pump.on 'serversSweeped', servers_sweeped
    @pump.on 'message', (data) =>
      console.log 'got message'
      @log JSON.stringify(data)
    @pump.connect()
    
$ ->
  window.test = new TestCase
  window.test.start()
  