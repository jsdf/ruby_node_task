require 'node_task'
RSpec.describe NodeTask do
  it "spawns a node server" do
    server = NodeTask.server
    NodeTask.release
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
end
