var fs = require('fs')
var path = require('path')
var workingDir = process.env.NODE_TASK_CWD || __dirname
var errorLogPath = path.resolve(workingDir, 'ruby_node_task-error.log')

var log
attachUnhandledExceptionHandler()

// daemonise
// var daemon = require('daemon')
// daemon()
fs.writeFileSync(path.resolve(workingDir, './ruby_node_task.pid'), process.pid+'')
attachUnhandledExceptionHandler()

var net = require('net')
var ndjson = require('ndjson')
var winston = require('winston')
var makeSockPath = require('./makeSockPath')

log = new winston.Logger({
  transports: [
    new winston.transports.File({
      filename: path.resolve(workingDir, 'ruby_node_task-debug.log'),
      level: 'debug',
    }),
  ],
})

log.info('hi')

var sockPath = process.env.NODE_TASK_SOCK_PATH || makeSockPath(
  workingDir,
  process.env.NODE_TASK_DAEMON_ID || 'ruby_node_task'
)

function serialiseMsg(msg) {
  return JSON.stringify(msg)+'\n'
}

function errorMsg(err) {
  return {error: {message: err.message, code: err.code}}
}

var clientsActive = 0
var server = net.createServer(function(socket) {
  log.debug('client connected')
  clientsActive++

  // use end rather than close as once ended client intends to disconnect
  socket.on('end', function(){
    log.debug('client finished')
    clientsActive--
  })

  function sendMsg(msg) { socket.end(serialiseMsg(msg)) }
  function sendError(err) { socket.end(serialiseMsg(errorMsg(err))) }

  var busy = false
  var msgs = []
  socket
    .on('error', function(err) {
      log.error('socket error: '+err.toString(), {messages: msgs})
    })
    .pipe(ndjson.parse())
    .on('error', sendError)
    .on('data', function(msg) {
      msgs.push(msg)

      if (busy) {
        return sendError(new Error('only one task can be run per connection'))
      }

      if (msg.status) {
        return sendMsg({clients: clientsActive-1}) // minus this connection
      }

      if (!msg.task) {
        return sendError(new Error('msg.task not defined'))
      }

      try {
        var runTask = require(path.resolve(workingDir, msg.task))
      } catch (err) {
        return sendError(err)
      }

      var opts = msg.opts || {}
      busy = true
      runTask(opts, function(err, result) {
        busy = false
        if (err) {
          log.error('task error: '+err)
          sendError(err)
        } else {
          log.debug('task complete: '+msg.task)
          sendMsg({result: result})
        }
      })
    })
})

server.on('error', function(err) {
  log.error('server error: '+err.toString())
})

server.listen(sockPath, function() {
  log.debug('listening on', sockPath)
})

process.on('exit', function() {
  log.debug('removing', sockPath)
  try{ fs.appendFileSync(errorLogPath, {encoding: 'utf8'}, 'exiting') } catch (err) {
    log.error(err.toString())
  }
  try {
    fs.unlinkSync(sockPath)
  } catch (err) {
    // already removed
  }
})

function attachUnhandledExceptionHandler() {
  process.on('unhandledException', function(err) {
    log && log.error(err.toString())
    try{ fs.appendFileSync(errorLogPath, {encoding: 'utf8'}, err.toString()) } catch (err) {}
    process.exit()
  })
}