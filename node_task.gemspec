require 'json'

Gem::Specification.new do |s|
  s.name        = 'node_task'
  s.version     = JSON.load(File.new('./lib/node_task/package.json'))['version']
  s.licenses    = ['MIT']
  s.summary     = "This is an node_task!"
  s.description = "Much longer explanation of the node_task!"
  s.authors     = ["James Friend"]
  s.email       = 'james@jsdf.co'
  s.files       = ["lib/node_task.rb"] + Dir["lib/node_task/*.*"] + Dir["lib/node_task/node_modules/**/*.*"]
  s.homepage    = 'https://rubygems.org/gems/node_task'
  s.add_runtime_dependency 'daemon_controller',  '~> 1.2', '>= 1.2.0'
end
