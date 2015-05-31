var count = 0

module.exports = function(opts, done) {
  console.log('message', opts)

  count++
  done(null, {count: count, opts: opts})
}
