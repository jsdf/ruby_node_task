require 'node_task'
RSpec.describe NodeTask do
  after(:each) do
    NodeTask.release
  end

  it "spawns a node server" do
    server = NodeTask.server
  end

  it "runs tasks" do
    t = NodeTask.new './lib/node_task/example/count'
    result = t.run
    expect(result).not_to be_nil
    expect(result[:count]).to be(1)

    result = t.run
    expect(result).not_to be_nil
    expect(result[:count]).to be(2)
  end

  it "runs tasks referenced by absolute paths" do
    t = NodeTask.new File.expand_path('./lib/node_task/example/count.js')
    result = t.run
    expect(result).not_to be_nil
    expect(result[:count]).to be(1)
  end
end
