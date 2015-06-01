var fs = require('fs')
var path = require('path')
var net = require('net')
var winston = require('winston')
var ndjson = require('ndjson')
var makeSockPath = require('./makeSockPath')

var workingDir = process.env.NODE_TASK_CWD || __dirname
var errorLogPath = path.resolve(workingDir, './ruby_node_task-error.log')

// write pidfile
fs.writeFileSync(path.resolve(workingDir, './ruby_node_task.pid'), process.pid+'')

var log = new winston.Logger({
  transports: [
    process.env.NODE_TASK_DEBUG ? new winston.transports.File({
      filename: path.resolve(workingDir, 'ruby_node_task-debug.log'),
      level: 'debug',
    }) : new winston.transports.Console(),
  ],
})

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

var server = net.createServer(function(socket) {
  log.debug('client connected')

  // use end rather than close as once ended client intends to disconnect
  socket.on('end', function() {
    log.debug('client finished')
  })

  socket.on('close', function() {
    log.debug('client disconnect')
  })

  function sendMsg(msg) { socket.end(serialiseMsg(msg)) }
  function sendError(err) { socket.end(serialiseMsg(errorMsg(err))) }

  var busy = false
  socket
    .on('error', function(err) {
      log.error('socket error: '+err.toString())
    })
    .pipe(ndjson.parse())
    .on('error', sendError)
    .on('data', function(msg) {
      if (busy) {
        return sendError(new Error('only one task can be run per connection'))
      }

      if (msg.status) {
        return server.getConnections(function(err, count) {
          sendMsg({clients: count-1}) // minus this connection
        })
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
  log.debug('listening on '+sockPath)
})

process.on('exit', function() {
  log.debug('removing '+sockPath)
  try {
    fs.unlinkSync(sockPath)
  } catch (err) {
    // already removed
  }
})

process.on('uncaughtException', function(err) {
  log.error('uncaught exception: '+err.toString(), function () {
    try {
      fs.writeFileSync(errorLogPath, err.stack)
    } catch (err) {
      return log.error('logging error: '+err.toString(), function () {
        process.exit()
      })
    }
    process.exit()
  })
})
