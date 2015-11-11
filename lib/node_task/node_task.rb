require 'socket'
require 'json'
require 'daemon_controller'
require 'timeout'
require 'logger'

class NodeTask
  RESPONSE_TIMEOUT = 9999
  START_MAX_RETRIES = 1

  class Error < StandardError
    attr_accessor :js_error

    def initialize(original_js_error)
      @js_error = original_js_error

      super(@js_error ? @js_error[:message] : nil)
    end

    def to_s
      return super unless @js_error

      @js_error[:stack] || @js_error[:message]
    end
  end

  class << self
    attr_writer :node_command
    attr_writer :logger
    attr_writer :working_dir

    def windows?
      (/cygwin|mswin|mingw|bccwin|wince|emx/ =~ RUBY_PLATFORM) != nil
    end

    def logger
      return @logger unless @logger.nil?
      @logger = Logger.new(STDERR)
      @logger.level = ENV["NODE_TASK_DEBUG"] ? Logger::DEBUG : Logger::INFO 
      @logger
    end

    def working_dir
      @working_dir || Dir.pwd
    end

    def error_log_file
      File.join(working_dir, "#{daemon_identifier}-error.log")
    end

    def pid_file
      File.join(working_dir, "#{daemon_identifier}.pid")
    end

    def gem_dir
      @gem_dir ||= File.dirname(File.expand_path(__FILE__))
    end

    def daemon_identifier
      'ruby_node_task'
    end

    def socket_path
      @socket_path ||= _make_sock_path(working_dir, daemon_identifier)
    end

    def node_command
      @node_command || ENV["NODE_COMMAND"] || 'node'
    end

    def daemon_start_script
      File.join(gem_dir, 'nodeTask.js').to_s
    end

    # get configured daemon controller for daemon, and start it
    def server
      @controller ||= _make_daemon_controller

      begin
        @controller.start
        logger.debug "spawned server #{@controller.pid}"
      rescue DaemonController::AlreadyStarted => e
        logger.debug "server already running #{@controller.pid}"
      end

      @controller
    end

    # really try to successfully connect, starting the daemon if required
    def ensure_connection
      attempt = 0
      begin
        server # make sure daemon is running

        socket = server.connect do
          begin
            _make_connection
          rescue Errno::ENOENT => e 
            # daemon_controller doesn't understand ENOENT
            raise Errno::ECONNREFUSED, e.message
          end
        end
      rescue DaemonController::StartTimeout, DaemonController::StartError => e
        logger.error e.message
        if attempt < START_MAX_RETRIES
          attempt += 1
          logger.error "retrying attempt #{attempt}"
          retry
        else
          raise e
        end
      end

      socket
    end

    def check_error
      if File.exist? error_log_file
        # TODO: raise error
        logger.error File.open(error_log_file).read
        File.unlink error_log_file
        true
      end
    end

    # get a json response from socket
    def parse_response(socket)
      # only take one message - the result
      # response terminated by newline
      response_text = nil
      loop do
        response_text = socket.gets("\n")
        break if response_text
        break if check_error
      end
      if response_text
        JSON.parse(response_text, symbolize_names: true)
      else
        logger.error 'no response for message'
        nil
      end
    end

    # make a single request, get a response and close the connection
    def request(socket, message)
      socket.write(message.to_json+"\n")

      result = nil
      begin
        Timeout::timeout(RESPONSE_TIMEOUT) do
          result = parse_response(socket)
        end
      rescue Timeout::Error, Exception => e
        logger.error e.message
      ensure
        # disconnect after receiving response
        socket.close
      end

      result
    end

    def alive?
      current_pid = nil
      alive = false
      if @controller
        begin
          current_pid = @controller.pid
        rescue Errno::ENOENT
        end
      end
      if current_pid
        begin
          Process.getpgid(current_pid)
          alive = true
        rescue Errno::ESRCH
        end
      end
      alive
    end

    # stop the daemon
    def release
      return unless alive?

      logger.debug "stopping daemon #{@controller.pid}"
      @controller.stop

      begin
        File.unlink socket_path
      rescue Errno::ENOENT => e
        # socket file's already gone
      end
    end

    def daemon_env
      {
        "NODE_TASK_SOCK_PATH" => socket_path,
        "NODE_TASK_CWD" => working_dir,
        "NODE_TASK_DAEMON_ID" => daemon_identifier,
        "NODE_TASK_PARENT_PID" => Process.pid.to_s,
        "NODE_TASK_PARENT_CHECK_INTERVAL" => parent_check_interval.to_s,
        "NODE_ENV" => ENV["RACK_ENV"],
      }
    end

    def parent_check_interval
      1000
    end

    private

    def _make_connection
      UNIXSocket.new socket_path
    end

    def _make_sock_path(dir, name)
      if windows?
        "\\\\.\\pipe\\#{name}\\#{File.expand_path(dir)}"
      else
        File.join(dir, "#{name}.sock")
      end
    end

    # TODO:
    # - some server errors not reported
    def _make_daemon_controller
      logger.debug "socket_path #{socket_path}"
      logger.debug "starting #{node_command} #{daemon_start_script}"

      controller = DaemonController.new(
        identifier: daemon_identifier,
        start_command: "#{node_command} #{daemon_start_script}",
        ping_command: Proc.new{
          begin
            _make_connection
          rescue Errno::ENOENT => e 
            # daemon_controller doesn't understand ENOENT
            raise Errno::ECONNREFUSED, e.message
          end
        },
        pid_file: pid_file,
        log_file: error_log_file,
        env: daemon_env,
        log_file_activity_timeout: RESPONSE_TIMEOUT,
        start_timeout: RESPONSE_TIMEOUT,
        daemonize_for_me: true,
      )

      controller
    end
  end

  attr_accessor :task

  def initialize(_task)
    @task = _task
  end

  def run(opts = nil)
    socket = self.class.ensure_connection

    message = {
      task: task,
      opts: opts,
    }

    response = self.class.request(socket, message)
    if response
      if response[:error]
        raise NodeTask::Error, response[:error]
      else
        response[:result]
      end
    end
  end
end
