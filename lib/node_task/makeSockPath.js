var path = require('path')

// make a path for a cross platform compatible socket
function makeSockPath(dir, name) {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\'+name+'\\' + path.resolve(dir)
  } else {
    return path.join(dir, name+'.sock')
  }
}

module.exports = makeSockPath
