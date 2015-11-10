var fs = require('fs')
var path = require('path')
var net = require('net')
var ndjson = require('ndjson')

var parentCheckInterval = parseInt(process.env.NODE_TASK_PARENT_CHECK_INTERVAL, 10) || 1000
var parentPid = String(process.env.NODE_TASK_DAEMON_ID)

var workingDir = path.resolve(process.env.NODE_TASK_CWD || __dirname)
var errorLogPath = path.join(workingDir, 'ruby_node_task-error.log')
var debugLogPath = path.join(workingDir, 'ruby_node_task-debug.log')

// write pidfile
fs.writeFileSync(path.join(workingDir, 'ruby_node_task.pid'), process.pid+'')

var logger = makeLogger(debugLogPath, process.env.NODE_TASK_DEBUG_LOG)

var sockPath = process.env.NODE_TASK_SOCK_PATH || makeSockPath(
  workingDir,
  process.env.NODE_TASK_DAEMON_ID || 'ruby_node_task'
)

var server = net.createServer(onClientConnect)
  .on('error', function (err) { logger.error('server error: '+err.toString()) })
  .listen(sockPath, function() { logger.debug('listening on '+sockPath) })

process.on('exit', onExit)
process.on('uncaughtException', onUncaughtException)

setInterval(checkParentAliveOrExit, parentCheckInterval)

// the important part
function onClientConnect(socket) {
  logger.debug('client connected')

  var busy = false
  socket
    .on('error', function(err) { logger.error('socket error: '+err.toString()) })
    .on('end', function() { logger.debug('client finished') })
    .on('close', function() { logger.debug('client disconnect') })
    .pipe(ndjson.parse())
    .on('error', sendError)
    .on('data', receiveMsg)
  
  function sendMsg(msg) { socket.end(serialiseMsg(msg)) }
  function sendError(err) { socket.end(serialiseMsg(errorMsg(err))) }
  function receiveMsg(msg) {
    if (busy) {
      return sendError(new Error('only one task can be run per connection'))
    }

    if (!msg.task) {
      return sendError(new Error('msg.task not defined'))
    }

    var runTask = loadTaskModule(path.resolve(workingDir, msg.task))

    var opts = msg.opts || {}
    busy = true
    runTask(opts, function(err, result) {
      busy = false
      if (err) {
        logger.error('task error: '+err)
        sendError(err)
      } else {
        logger.debug('task complete: '+msg.task)
        sendMsg({result: result})
      }
    })
  }
  
  function loadTaskModule(taskModule) {
    try {
      return require(taskModule)
    } catch (err) {
      return sendError(new Error('Encountered "'+err+'" while attempting to load task "'+taskModule+'"'))
    }
  }
}

function onUncaughtException(err) {
  try {
    fs.appendFileSync(errorLogPath, err.stack)
  } catch (err) {}

  logger.error('uncaught exception: '+formatError(err))

  process.exit()
}

function onExit() {
  try {
    fs.unlinkSync(sockPath)
    logger.debug('removed '+sockPath)
  } catch (err) {
    // already removed
  }
}

function checkParentAliveOrExit() {
  try {
    process.kill(parentPid, 0)
  } catch (err) {
    if (err.code === 'ESRCH') {
      logger.debug('parent '+parentPid+' is no longer alive, exiting')
      process.exit()
    }
  }
}

function makeLogger(logFilePath, debug) {
  function log(level, msg) {
    try {
      fs.appendFileSync(logFilePath, new Date().toISOString()+' -- '+level+' -- '+msg+'\n')
    } catch (e) {}
  }

  return {
    error: function(err) {
      log('error', formatError(err))
    },
    debug: function(msg) {
      if (debug) log('debug', msg)
    },
  }
}

function formatError(err) {
  return err && err.stack && JSON.stringify(err.stack) || err
}

// make a path for a cross platform compatible socket path
function makeSockPath(dir, name) {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\'+name+'\\' + path.resolve(dir)
  } else {
    return path.join(dir, name+'.sock')
  }
}

function serialiseMsg(msg) {
  return JSON.stringify(msg)+'\n'
}

function errorMsg(err) {
  return {
    error: {
      message: err.message,
      code: err.code,
      stack: err.stack,
    }
  }
}
