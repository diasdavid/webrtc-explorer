const Hapi = require('hapi')
const config = require('./config')
const log = config.log

exports = module.exports

exports.start = (callback) => {
  exports.http = new Hapi.Server(config.hapi.options)

  exports.http.connection({
    port: config.hapi.port
  })

  require('./routes-http/basic')
  // require('./routes-http/graph')

  exports.http.start(() => {
    log('signaling server has started on: ' + exports.http.info.uri)
    require('./routes-ws')
    callback()
  })
}

exports.stop = (callback) => {
  exports.http.stop(callback)
}
