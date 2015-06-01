Gem::Specification.new do |s|
  s.name        = 'node_task'
  s.version     = '0.1.0'
  s.licenses    = ['MIT']
  s.summary     = "This is an node_task!"
  s.description = "Much longer explanation of the node_task!"
  s.authors     = ["James Friend"]
  s.email       = 'james@jsdf.co'
  s.files       = ["lib/node_task.rb", "lib/node_task/**/*"]
  s.homepage    = 'https://rubygems.org/gems/node_task'
  s.add_runtime_dependency 'daemon_controller',  '~> 1.2', '>= 1.2.0'
end
