require 'bundler/gem_tasks'

begin
  require 'rspec/core/rake_task'
  RSpec::Core::RakeTask.new(:spec)
rescue LoadError
end

task 'npm_install_gem_deps' do
  system('cd lib/node_task; npm prune && npm install')
end

Rake::Task['build'].enhance(['npm_install_gem_deps'])
