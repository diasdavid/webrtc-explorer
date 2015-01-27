webrtc-ring
=======================================

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/diasdavid/webrtc-explorer?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

**tl;dr** ring inspired ring DHT algorithm using WebRTC as transport layer for P2P in the browser. You can find more about how it works underneath at [HOW_DOES_IT_WORK](/HOW_DOES_IT_WORD.md)

It enables you to communicate between several browsers in a p2p/decentralized fashion though a DHT.

# Badgers
[![NPM](https://nodei.co/npm/webrtc-ring.png?downloads=true&stars=true)](https://nodei.co/npm/webrtc-ring/)

[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/diasdavid/webrtc-ring?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge) 
[![Dependency Status](https://david-dm.org/diasdavid/webrtc-ring.svg)](https://david-dm.org/diasdavid/webrtc-ring)

# How to create a node

  webrtc-ring uses [browserify](http://browserify.org/)

  ```
  var ring = require('webrtc-ring');

  var nodeConfig = {
    signalingURL: 'http://url-to-webrtc-ring-signaling-server.com'
  };
  var node = ring.createNode(nodeConfig);

  node.e.on('ready', function () {
    // this node is ready
  });
  ```

# How to communicate with other nodes

  Send a message to a Node responsible for the ID `1af17e73721dbe0c40011b82ed4bb1a7dbe3ce29`

  ```
  var toId = '1af17e73721dbe0c40011b82ed4bb1a7dbe3ce29'; 
  // 160 bit ID represented in hex(`git_sha1` module is a good way to generate these)

  node.send(destID: toId, 
            data: 'hey, how are you doing');
  ```

  Send a message to this node sucessor (next node in ring)

  ```
  node.sendSucessor(data: 'hey, how are you doing');
  ```

  Receive a message
  ```
  node.e.on('message', function(message) {
    console.log(message);
  });
  ```

# Other options

## logging

  add the logging flag to your nodeConfig

  ```
  var nodeConfig = {
    //...
    logging: true
    //...
  };
  ```