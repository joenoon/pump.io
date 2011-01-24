install node as root locally:

{
mkdir ~/node-latest-install
cd ~/node-latest-install
curl http://nodejs.org/dist/node-latest.tar.gz | tar xz --strip-components=1
./configure --prefix=/usr/local
sudo make install
}

install coffeescript as root locally:
{
mkdir ~/coffeescript-latest
cd ~/coffeescript-latest
curl -Lsf http://github.com/jashkenas/coffee-script/tarball/master | tar xz --strip 1
sudo bin/cake install
}

from pump.io root:

  to develop, watching coffee files for changes:
    coffee -l -w -o lib -c src

  to build once:
    coffee -l -o lib -c src
    
use pump, create a server.coffee file (or js file):

  port = 3000
  host = '0.0.0.0'
  cluster_name = 'threadscluster'
  server_sweeper = true

  Pump = require 'pump.io'
  core_listeners = require 'pump.io/pump.io/core_listeners'
  db_listeners = require 'pump.io/pump.io/db_listeners'
  stub_listeners = require 'pump.io/pump.io/stub_listeners'

  if !module.parent
    # default options:
    #   port: 8080
    #   host: '0.0.0.0'
    #   cluster_name: 'pumpcluster'
    #   server_sweeper: false
    pump = Pump.create(process.env)
  
    pump.useAll(core_listeners)
    pump.useAll(db_listeners)
    pump.useAll(stub_listeners)    # comment this one out and add your own instead
    
    pump.launch()
    
    module.exports = pump.server


execute app in vm which has all dependencies met:

from this dir (on vm):

sudo node server.js
