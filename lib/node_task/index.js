var fs = require('fs')
var path = require('path')
var workingDir = process.env.NODE_TASK_CWD || __dirname

process.on('unhandledException', function(err) {
  try{ fs.appendFileSync(path.resolve(workingDir, 'ruby_node_task.log'), err.toString()) } catch (err) {}
  process.exit()
})

// daemonise
var daemon = require('daemon')
daemon()
fs.writeFileSync(path.resolve(workingDir, './ruby_node_task.pid'), process.pid+'')

var net = require('net')
var ndjson = require('ndjson')
var makeSockPath = require('./makeSockPath')

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
  console.log('client connected')
  clientsActive++

  // use end rather than close as once ended client intends to disconnect
  socket.on('end', function(){
    console.log('client finished')
    clientsActive--
  })

  function sendMsg(msg) { socket.write(serialiseMsg(msg)) }
  function sendError(err) { socket.write(serialiseMsg(errorMsg(err))) }

  var busy = false
  socket
    .pipe(ndjson.parse())
    .on('error', sendError)
    .on('data', function(msg) {
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
          console.error('task error', err)
          sendError(err)
        } else {
          console.log('task result', result)
          sendMsg({result: result})
        }
      })
    })
})

server.listen(sockPath, function() {
  console.log('listening on', sockPath)
})

// catches ctrl+c event
process.on('SIGINT', function() { process.exit() })

process.on('exit', function() {
  console.log('removing', sockPath)
  try {
    fs.unlinkSync(sockPath)
  } catch (err) {

  }
})
