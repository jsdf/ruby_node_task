# ruby_node_task
Run node.js scripts from Ruby with a persistent worker

```js
// a node.js module
var count = 0;
module.exports = function(opts, done) {
  count++;
  done(null, {count: count});
}
```

```ruby
require 'node_task'

# run a task
t = NodeTask.new './lib/node_task/example/count'
result = t.run
expect(result[:count]).to be(1)

# again
result = t.run
expect(result[:count]).to be(2)
```
