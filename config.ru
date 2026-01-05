require 'rack'

class SharedArrayBufferHeaders
  def initialize(app)
    @app = app
  end

  def call(env)
    status, headers, body = @app.call(env)
    headers['cross-origin-opener-policy'] = 'same-origin'
    headers['cross-origin-embedder-policy'] = 'require-corp'
    [status, headers, body]
  end
end

use SharedArrayBufferHeaders
run Rack::Directory.new('.')
