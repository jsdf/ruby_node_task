module.exports = function(opts, done) {
  var data = ""
  for (var i = opts.n - 1; i >= 0; i--) {
    data += 'a'
  }

  done(null, {bytes: data})
}
